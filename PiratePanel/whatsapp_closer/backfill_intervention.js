const { Client, LocalAuth } = require('whatsapp-web.js');
const { supabase, updateLeadMetadata } = require('./supabaseClient');

console.log("🛠️ Iniciando Varredura de Mensagens Antigas para detectar intervenção humana...");

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', () => console.log('❌ Erro: Sessão expirada. Autentique-se no index.js primeiro.'));

client.on('ready', async () => {
    console.log('✅ Conectado! Iniciando verificação de leads...');

    // Busca leads que estão em processo de venda
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .in('current_state', ['outreached', 'nurtured', 'qualified'])
        .is('metadata->active_bot', null);

    if (error || !leads) {
        console.error("Erro ao buscar leads:", error);
        process.exit(1);
    }

    console.log(`🔍 Analisando ${leads.length} leads para detectar conversa manual...`);

    let interventionCount = 0;

    for (const lead of leads) {
        const phone = lead.metadata?.whatsapp;
        if (!phone) continue;

        const chatId = `${phone}@c.us`;

        try {
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: 20 });

            // Identifica se há alguma mensagem enviada (fromMe) que NÃO esteja no histórico do Supabase
            // ou se a última mensagem foi do humano.
            const dbHistory = lead.metadata?.chat_history || [];
            const dbTexts = dbHistory.map(h => h.text);

            let humanFound = false;
            for (const msg of messages) {
                if (msg.fromMe && !dbTexts.includes(msg.body) && !msg.body.startsWith('🔥 *LEAD QUENTE')) {
                    humanFound = true;
                    break;
                }
            }

            if (humanFound) {
                console.log(`🤝 [INTERVENÇÃO DETECTADA] @${lead.handle} já possui mensagens manuais. Desativando bot.`);
                lead.metadata.active_bot = false;
                lead.metadata.human_intervened = true;
                await updateLeadMetadata(lead.id, lead.metadata);
                interventionCount++;
            }
        } catch (e) {
            // Silencioso para números que nunca conversaram
        }
    }

    console.log(`\n🎉 Varredura concluída! ${interventionCount} leads foram marcados para controle humano.`);
    process.exit(0);
});

client.initialize();
