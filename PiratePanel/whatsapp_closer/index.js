const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {
    supabase,
    getPendingLeads,
    updateLeadState,
    appendConversationHistory,
    findLeadByPhone,
    getLeadsForFollowUp,
    updateLeadMetadata
} = require('./supabaseClient');
const { generateResponse, summarizeHistory } = require('./geminiBrain');
const { classifyIntent, getIntentInstruction } = require('./intentClassifier');
const { detectObjection } = require('./sales_bible/objections');
const { createLeadCoupon } = require('./stripeActions');

const HUMAN_CLOSER_NUMBER = '5511980150905@c.us'; // WhatsApp do Closer Humano

// ==========================================
// CONFIGURAÇÕES DO MOTOR STEALTH (ANTI-BAN)
// ==========================================
const WORK_HOURS = { start: 9, end: 18 }; // Horário Comercial Seguro
const DAILY_LIMIT_MAX = 50; // Limite máximo absoluto para o Closer
let dailySentCount = 0;
let dailyRewardCount = 0;
let lastResetDate = new Date().getDate();

// --- NOVO: JITTER NO EXPEDIENTE (HORÁRIOS VARIÁVEIS) ---
let CURRENT_DAILY_WORK_HOURS = { 
    start: 9 + (Math.random() * 0.6 - 0.3), // 9h +/- 18 min
    end: 18 + (Math.random() * 0.6 - 0.3)   // 18h +/- 18 min
};

// Tempos randômicos para parecer humano (em milissegundos)
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// Adiciona um "jitter" (variação aleatória) em qualquer valor numérico (+/- 15%)
const addJitter = (value) => {
    const jitter = value * 0.15;
    return value + getRandomDelay(-jitter, jitter);
};

const READ_DELAY = (msgLength = 0) => {
    // Base 8s a 18s + 25ms por caractere (simula o tempo de leitura real)
    const extraReadingTime = Math.min(msgLength * 25, 12000); 
    return addJitter(getRandomDelay(8000 + extraReadingTime, 15000 + extraReadingTime));
};
const TYPING_DELAY_PER_CHAR = 180; // Base: 180ms por caractere
const OUTBOUND_INTERVAL = () => addJitter(getRandomDelay(10 * 60 * 1000, 25 * 60 * 1000));

// --- NOVO: VARIAÇÕES DE FOLLOW-UP ---
function getRandomFollowUp(intent) {
    // Se o lead já tinha intenção MORNO ou QUENTE antes, o follow-up deve ser mais escasso/agressivo.
    const isHotOrWarm = intent === 'QUENTE' || intent === 'MORNO';

    const hardVariations = [
        "Passando pra te dar um toque que seu link com desconto do Platinum deve expirar em breve, beleza? Qualquer dúvida me avisa.",
        "Oi! Conseguiu criar a sua conta na plataforma? Vi que seu acesso ainda não foi ativado.",
        "Sei que a rotina deve estar corrida, mas passando pra lembrar que a oferta de ontem ainda tá de pé. Bora ativar o Platinum?",
        "Tudo bem? Assumo que automatizar o Instagram não seja sua prioridade máxima hoje. Mas se quiser testar a Hubica depois, o link é hubica.com.br",
        "Oi! Conseguiu ver o material acima? Eu posso segurar a condição do Platinum pra você até o fim do dia."
    ];

    const softVariations = [
        "Oi! Conseguiu dar uma olhada na mensagem ali em cima?",
        "Tudo bem? Ficou alguma dúvida sobre o que conversamos ontem?",
        "Passando aqui só pra o contato não se perder na sua lista. Qualquer coisa me dá um grito!",
        "Sei que a rotina é corrida, só passando pra saber se conseguiu ver o que te mandei. :)"
    ];

    const variations = isHotOrWarm ? hardVariations : softVariations;
    return variations[Math.floor(Math.random() * variations.length)];
}

// --- NOVO: SIMULAÇÃO DE ERRO DE DIGITAÇÃO ---
function introduceTypo(text) {
    if (text.length < 10) return text;
    // Escolhe uma palavra longa para errar
    const words = text.split(' ');
    const longWordIndex = words.findIndex(w => w.length > 5);
    if (longWordIndex === -1) return text;

    let word = words[longWordIndex];
    // Inverte duas letras
    const arr = word.split('');
    const pos = Math.floor(Math.random() * (arr.length - 1));
    [arr[pos], arr[pos+1]] = [arr[pos+1], arr[pos]];
    
    words[longWordIndex] = arr.join('');
    return words.join(' ');
}

// Bloqueio de concorrência para não bugar o Puppeteer/WhatsApp
let isProcessing = false;

// --- NOVO: HELPER PARA EVITAR ERRO "No LID for user" ---
async function safeGetChat(chatId) {
    try {
        return await client.getChatById(chatId);
    } catch (err) {
        console.warn(`⚠️ [LID-FIX] Não foi possível obter objeto do chat para ${chatId}. Erro: ${err.message}`);
        return null;
    }
}

// --- MOTOR DE SEGURANÇA COMPARTILHADO ---
async function canProcess() {
    const now = new Date();
    const currentHour = now.getHours();

    // Reset diário (e gera novos horários de expediente)
    if (now.getDate() !== lastResetDate) {
        dailySentCount = 0;
        dailyRewardCount = 0;
        lastResetDate = now.getDate();
        CURRENT_DAILY_WORK_HOURS = { 
            start: 9 + (Math.random() * 0.6 - 0.3),
            end: 18 + (Math.random() * 0.6 - 0.3)
        };
        console.log(`[SYS] Novo expediente para hoje: ${CURRENT_DAILY_WORK_HOURS.start.toFixed(2)}h às ${CURRENT_DAILY_WORK_HOURS.end.toFixed(2)}h`);
    }

    // Horário Comercial (usando o jitter do dia)
    const currentDecimalTime = now.getHours() + now.getMinutes() / 60;
    if (currentDecimalTime < CURRENT_DAILY_WORK_HOURS.start || currentDecimalTime >= CURRENT_DAILY_WORK_HOURS.end) {
        return { allowed: false, reason: "Fora do horário comercial" };
    }

    // Limite Diário
    const effectiveLimit = getDailyLimit() + dailyRewardCount;
    if (dailySentCount >= effectiveLimit) {
        return { allowed: false, reason: `Limite diário (${effectiveLimit}) atingido` };
    }

    // Pausas Aleatórias (Café/Almoço)
    if (Math.random() < 0.20) return { allowed: false, reason: "Pausa para café" };
    if (currentHour === 12 || (currentHour === 13 && now.getMinutes() < 30)) {
        if (Math.random() < 0.60) return { allowed: false, reason: "Pausa para almoço" };
    }

    if (isProcessing) return { allowed: false, reason: "Ocupado com outro processo" };

    return { allowed: true };
}

// Cache de Mensagens para evitar loops (Anti-Bot Trap)
const processedMessages = new Set();
const lastMessageContent = new Map(); // LeadId -> Ultima mensagem recebida (evita responder menu repetido)

// --- SUPORTE A MÚLTIPLAS SESSÕES E BANNER (PIRATE TERMINAL) ---
const sessionName = process.argv[2] || 'default';

function printCyberBanner(session) {
    const colorRed = '\x1b[31m';
    const colorReset = '\x1b[0m';
    console.log(colorRed);
    console.log(`   _____ _      ____   _____ ______ _____  `);
    console.log(`  / ____| |    / __ \\ / ____|  ____|  __ \\ `);
    console.log(` | |    | |   | |  | | (___ | |__  | |__) |`);
    console.log(` | |    | |   | |  | |\\___ \\|  __| |  _  / `);
    console.log(` | |____| |___| |__| |____) | |____| | \\ \\ `);
    console.log(`  \\_____|______\\____/|_____/|______|_|  \\_\\`);
    console.log(`\n [ SYSTEM STATE: ACTIVE ] [ INSTANCE: ${session.toUpperCase()} ]`);
    console.log(` [ MODULE: WHATSAPP_CLOSER ]`);
    console.log('-'.repeat(50) + colorReset);
}

printCyberBanner(sessionName);


// Inicializa o Cliente do WhatsApp (LocalAuth salva a sessão na pasta para não ler QR toda hora)
const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionName }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    // --- NOVO: EMITE QR CODE RAW PARA O PAINEL PYTHON INTERCEPTAR ---
    console.log(`[QR_CODE_RAW] ${qr}`);
    
    console.log('📱 Leia este QR Code com o WhatsApp da Hubica:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Cérebro do WhatsApp conectado com sucesso!');
    console.log('🛡️ Stealth Mode Ativado. Monitorando leads...');

    // --- INÍCIO DA SINCRONIZAÇÃO DE MENSAGENS OFFLINE ---
    try {
        console.log('🔄 Sincronizando mensagens recebidas enquanto o bot estava desligado...');
        const chats = await client.getChats();
        let unreadTotal = 0;
        
        for (const chat of chats) {
            if (chat.unreadCount > 0) {
                console.log(`📥 Processando ${chat.unreadCount} mensagem(ns) não lida(s) de: ${chat.name || chat.id.user}`);
                
                const messages = await chat.fetchMessages({ limit: chat.unreadCount });
                
                for (const msg of messages) {
                    if (!msg.fromMe && !msg.isStatus) {
                        // Joga a mensagem para o motor principal processar
                        await handleInboundMessage(msg);
                        unreadTotal++;
                        
                        // DELAY: Espera entre 5 e 12 segundos antes de processar a próxima mensagem 
                        // Isso simula o tempo de um humano mudando de conversa e lendo os atrasados
                        const pause = getRandomDelay(5000, 12000);
                        console.log(`⏳ Aguardando ${Math.round(pause/1000)}s antes de processar a próxima...`);
                        await new Promise(resolve => setTimeout(resolve, pause));
                    }
                }
                
                // Marca a conversa como lida após responder os pendentes
                await chat.sendSeen();
            }
        }
        
        if (unreadTotal > 0) {
            console.log(`✅ Sincronização offline concluída! ${unreadTotal} mensagens processadas de forma humanizada.`);
        } else {
            console.log('✅ Nenhuma mensagem offline pendente.');
        }
    } catch (err) {
        console.error('❌ Erro durante a sincronização de mensagens offline:', err);
    }
    // --- FIM DA SINCRONIZAÇÃO ---

    // Inicia os Motores em Paralelo
    coldApproachEngine();
    followUpEngine();
});

// ==========================================
// FILA DE EXECUÇÃO SEQUENCIAL (ANTI-ATROPELO)
// ==========================================
let isProcessingQueue = false;
const messageQueue = [];

async function processMessageQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        // ... (resto processMessageQueue ficará aqui, retirando do replace ruim anterior)
        const { msg, lead, history, enrichedMessage, leadContext, conversationSummary } = messageQueue.shift();

        try {
            const iaResponseText = await generateResponse(history, enrichedMessage, leadContext, conversationSummary);

            // Suporte a divisão por |, Quebra de linha e também /
            const chunks = iaResponseText.split(/\||\n|\//).filter(c => c.trim().length > 0);

            for (const chunk of chunks) {
                let textToSend = chunk.trim();
                let typoVersion = null;

                // --- NOVO: CHANCE DE ERRO DE DIGITAÇÃO (5%) ---
                if (Math.random() < 0.05 && textToSend.length > 15) {
                    typoVersion = introduceTypo(textToSend);
                    console.log(`😜 [HUMAN TOUCH] Introduzindo erro proposital.`);
                }

                let chat = null;
                try {
                    chat = await msg.getChat();
                    if (chat) chat.sendStateTyping();
                } catch (e) {
                    console.warn(`⚠️ [LID-FIX] Erro ao obter chat/typing status: ${e.message}`);
                }
                
                const finalMsg = typoVersion || textToSend;
                const totalTypingTime = Math.min(Math.max(finalMsg.length * 50, 1500), 7000);
                
                if (finalMsg.length > 60) {
                    const firstPhase = totalTypingTime * 0.4;
                    const pauseTime = addJitter(1500);
                    const secondPhase = totalTypingTime * 0.6;

                    await new Promise(res => setTimeout(res, firstPhase));
                    chat.clearState();
                    await new Promise(res => setTimeout(res, pauseTime));
                    chat.sendStateTyping();
                    await new Promise(res => setTimeout(res, secondPhase));
                } else {
                    await new Promise(resolve => setTimeout(resolve, addJitter(totalTypingTime)));
                }

                chat.clearState();
                await client.sendMessage(msg.from, finalMsg);
                console.log(`📤 Enviou balão para ${lead.handle}: "${finalMsg}"`);

                // Se teve erro, manda a correção logo depois
                if (typoVersion) {
                    await new Promise(res => setTimeout(res, getRandomDelay(2000, 4000)));
                    await client.sendMessage(msg.from, `*${textToSend.split(' ').find(w => w.length > 5)}`);
                }

                await new Promise(resolve => setTimeout(resolve, getRandomDelay(1000, 2500)));
            }

            const cleanResponseForAiMemory = iaResponseText.replace(/\|/g, " ");
            await appendConversationHistory(lead.id, lead.metadata, 'hubica_closer', cleanResponseForAiMemory);

            if (lead.current_state === 'outreached') {
                await updateLeadState(lead.id, 'nurtured');
            }
        } catch (err) {
            console.error('❌ [ERRO NO WORKER] Exceção processando item da fila:', err.message);
        }
    }
    isProcessingQueue = false;
}

// ==========================================
// MOTOR INBOUND (Escutando e Respondendo)
// ==========================================

// 🔍 DEBUG RAW — mostra TODA mensagem que chega
client.on('message', async (msg) => {
    if (msg.fromMe) return;
    let rawPhone = msg.from;
    if (rawPhone.includes('@lid')) {
        try { const c = await msg.getContact(); rawPhone = `${c.number}@c.us`; } catch (_) { }
    }
    console.log(`\n🔔 [DEBUG] from: ${msg.from} | resolvido: ${rawPhone} | body: ${msg.body?.substring(0, 50)}`);
});

async function handleInboundMessage(msg) {
    try {
        if (msg.fromMe) return;
        if (!msg.body || msg.body.trim().length === 0) return;

        // 1. Anti-Duplicação de Evento
        if (processedMessages.has(msg.id.id)) return;
        processedMessages.add(msg.id.id);
        
        // Limpa cache antigo pra não explodir RAM
        if (processedMessages.size > 1000) processedMessages.clear();

        // Resolve o novo formato @lid do WhatsApp para o número real
        let phoneToSearch = msg.from;
        if (msg.from.includes('@lid')) {
            try {
                const contact = await msg.getContact();
                phoneToSearch = `${contact.number}@c.us`;
                console.log(`🔄 LID resolvido: ${msg.from} → ${phoneToSearch}`);
            } catch (e) {
                console.log(`⚠️ Não conseguiu resolver LID: ${msg.from}`);
                return;
            }
        }

        const lead = await findLeadByPhone(phoneToSearch);
        console.log(`🔍 [DEBUG] findLeadByPhone("${phoneToSearch}") =>`, lead ? `encontrou @${lead.handle} [${lead.current_state}]` : 'NÃO ENCONTROU');
        if (!lead) return;

        // 🛡️ [HUMAN HANDOVER] Verifica se o humano já assumiu a conversa
        if (lead.metadata?.active_bot === false) {
            console.log(`🛡️ [HUMAN TAKE-OVER] @${lead.handle} está sob controle humano. Bot silenciado.`);
            return;
        }

        // Ignora apenas leads definitivamente encerrados
        if (lead.current_state === 'lost' || lead.current_state === 'converted') return;

        // Log para depuração
        console.log(`\n💬 Mensagem de ${lead.handle} [estado: ${lead.current_state}]: "${msg.body.substring(0, 100)}..."`);

        // 2. Anti-Loop Contra Auto-Responders
        const normalizedBody = msg.body.trim().toLowerCase();

        // --- NOVO: FILTRO HARD-CODED DE MENSAGENS AUTOMÁTICAS ---
        const AUTO_REPLY_PATTERNS = [
            /bom dia! como posso ajudar/i,
            /olá! esta é uma mensagem automática/i,
            /estou ausente no momento/i,
            /em que posso ajudar\?/i,
            /obrigado por entrar em contato/i,
            /saudação da empresa/i,
            /responderemos em breve/i
        ];
        if (AUTO_REPLY_PATTERNS.some(p => p.test(normalizedBody))) {
            console.log(`🛡️ [AUTO-RESPONSE] @${lead.handle} mandou resposta automática (Hard-coded). Ignorando.`);
            return;
        }

        if (lastMessageContent.get(lead.id) === normalizedBody) {
            console.log(`🛡️ [ANTI-LOOP] @${lead.handle} mandou mensagem repetida. Ignorando para não canibalizar IA.`);
            return;
        }
        lastMessageContent.set(lead.id, normalizedBody);

        // Se o lead respondeu antes da isca (ainda 'qualified') ou após a isca ('outreached'),  já vira 'nurtured'
        if (lead.current_state === 'qualified' || lead.current_state === 'outreached') {
            await updateLeadState(lead.id, 'nurtured');
            lead.current_state = 'nurtured';
            
            // REWARD SYSTEM: O Lead engajou. O WhatsApp subiu o Trust Score da nossa conta. Ganhamos +1 envio Frio MÁX.
            dailyRewardCount++;
            console.log(`🎉 [REWARD SYSTEM] O WhatsApp Confia mais na Conta. Limite diário expandido (+1)`);
        }

        // Simula o tempo que uma pessoa demora pra ler e pegar o celular
        let readingTime = READ_DELAY(msg.body.length);
        
        // --- NOVO: FILTRO DE BAIXO ENGAJAMENTO (OK, BELEZA, ETC) ---
        const lowEngagementRegex = /^(ok|beleza|show|top|fechado|vlw|vale|entendi|👍|boa)$/i;
        if (lowEngagementRegex.test(msg.body.trim())) {
            console.log(`💤 [HUMAN TOUCH] Mensagem de baixo engajamento. Aumentando delay de resposta.`);
            readingTime += getRandomDelay(30000, 120000); // Espera de 30s a 2min extras
        }

        await new Promise(resolve => setTimeout(resolve, readingTime));

        // Manda o "Visto" azul
        let chat = null;
        try {
            chat = await msg.getChat();
            if (chat) await chat.sendSeen();
        } catch (e) {
            console.warn(`⚠️ [LID-FIX] Erro ao dar "visto": ${e.message}`);
        }

        // 2. Registra o que o cliente disse no banco
        await appendConversationHistory(lead.id, lead.metadata, 'client', msg.body);

        // 3. Pede pro Cérebro Gemini pensar na resposta
        console.log('🧠 Gemini está raciocinando a resposta...');
        if (chat) chat.sendStateTyping(); // Mostra "digitando..."

        // === ESCUDO ANTI PROMPT INJECTION ===
        const injectionPatterns = [
            /SYSTEM_UPDATE/i, /ignore (as|todas as|suas|previous|all) (instruç|instruction|regras)/i,
            /\[SYSTEM/i, /a partir de agora (você|vc|seu|seu papel)/i,
            /(novo protocolo|new protocol)/i, /(finja ser|aja como|pretend to be|roleplay as)/i,
            /(mascote|persona|galinha|animal|imita)/i,
        ];
        if (injectionPatterns.some(p => p.test(msg.body))) {
            chat.clearState();
            await client.sendMessage(msg.from, '?');
            console.log(`🛡️ Prompt Injection bloqueado de ${lead.handle}.`);
            return;
        }
        // =====================================
        
        // 2. Apanhamos o array de volta atualizado para mandar para a IA
        const leadUpdated = await findLeadByPhone(phoneToSearch);
        const history = leadUpdated.metadata?.chat_history || [];

        // Verifica Memória Longa
        let conversationSummary = leadUpdated.metadata?.conversation_summary || null;
        if (history.length >= 10 && !conversationSummary) {
            conversationSummary = await summarizeHistory(history);
            // Salva o resumo no banco
            leadUpdated.metadata.conversation_summary = conversationSummary;
            await updateLeadState(leadUpdated.id, leadUpdated.current_state);
            console.log(`🧠 Resumo gerado para ${leadUpdated.handle}.`);
        }

        // Melhoria 5: Classificação de Intenção
        let intent = await classifyIntent(msg.body);
        
        // --- NOVO: CAPTURA DE INTENÇÃO DESCONHECIDA PARA AUDITORIA ---
        if (intent === 'UNKNOWN') {
            const failedLogs = leadUpdated.metadata.failed_intent_logs || [];
            failedLogs.push({ date: new Date().toISOString(), message: msg.body });
            leadUpdated.metadata.failed_intent_logs = failedLogs;
            
            // Salvando no banco de forma assíncrona para não travar o loop
            updateLeadMetadata(leadUpdated.id, leadUpdated.metadata)
                .then(() => console.warn(`🚨 [INTENT_UNKNOWN] Falha de IA registrada para @${leadUpdated.handle} no Supabase.`))
                .catch(err => console.error('Erro ao salvar falha de IA no banco:', err.message));
            
            intent = 'MORNO'; // Fallback seguro para o fluxo continuar
        }
        
        // --- NOVO: FILTRO GEMINI DE MENSAGENS AUTOMÁTICAS ---
        if (intent === 'AUTO') {
            console.log(`🛡️ [AUTO-RESPONSE] @${leadUpdated.handle} detectado como resposta automática pela IA. Ignorando.`);
            chat.clearState(); // Remove o "digitando"
            return;
        }

        const intentInstruction = getIntentInstruction(msg.body, intent);
        console.log(`🔍 Intenção: [${intent}]`);

        // --- NOVO: NOTIFICAÇÃO DE LEAD QUENTE ---
        if (intent === 'QUENTE') {
            console.log(`🔥 [HOT LEAD] Notificando closer humano sobre @${leadUpdated.handle}...`);
            const alertMsg = `🔥 *LEAD QUENTE DETECTADO!*\n\nLead: @${leadUpdated.handle}\nIntenção: ${intent}\nLink: https://instagram.com/${leadUpdated.handle}\n\nO bot ainda está respondendo, mas você pode intervir a qualquer momento.`;
            await client.sendMessage(HUMAN_CLOSER_NUMBER, alertMsg);
        }

        // Melhoria 2: Detecção de Objeção
        const objectionResponse = detectObjection(msg.body);

        // === GATILHO DE CUPOM STRIPE (PREÇO OU INTENÇÃO QUENTE) ===
        const isPriceObjection = /caro|preço|custo|barato|desconto|valor|cupom/i.test(msg.body);
        const isHotIntent = (intent === 'QUENTE');
        const triggerCoupon = isPriceObjection || isHotIntent;

        let couponInfo = null;
        const existingCoupon = leadUpdated.metadata?.stripe_coupon;

        if (triggerCoupon && !existingCoupon) {
            console.log(`💳 Criando cupom Stripe exclusivo (24h de validade) para ${leadUpdated.handle}...`);
            const newCoupon = await createLeadCoupon(leadUpdated.handle, 25); // Setado para 25 OFF
            if (newCoupon) {
                couponInfo = newCoupon;
                leadUpdated.metadata.stripe_coupon = newCoupon;
                await appendConversationHistory(leadUpdated.id, leadUpdated.metadata, 'system', `[CUPOM DE 25% OFF CRIADO: ${newCoupon.couponCode}]`);
                console.log(`💳 Cupom ${newCoupon.couponCode} criado e salvo no lead.`);
            }
        } else if (existingCoupon && triggerCoupon) {
            console.log(`💳 Lead já possuía o cupom ${existingCoupon.couponCode}. Reutilizando.`);
            couponInfo = existingCoupon; 
        }

        const couponBlock = couponInfo
            ? `[CUPOM STRIPE ATIVO: Código "${couponInfo.couponCode}" te dá 25% OFF no Platinum. Link de Assinatura: https://hubica.com.br/ . Diga ao lead para clicar no link, criar a conta, e na tela de pagamento usar esse cupom vip que você conseguiu agora pra ele.]\n`
            : '';

        // --- NOVO: EMAIL SCRAPER ---
        let emailExtracted = null;
        if (intentInstruction.includes('GATEKEEPER') || /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/.test(msg.body)) {
            const emailMatch = msg.body.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
                emailExtracted = emailMatch[0];
                leadUpdated.metadata.email = emailExtracted;
                console.log(`📧 E-mail capturado: ${emailExtracted}`);
                await updateLeadMetadata(leadUpdated.id, leadUpdated.metadata);
            }
        }

        // --- NOVO: PIVOT DE AUTORIDADE ---
        let pivotInstruction = '';
        if (!leadUpdated.metadata.is_pivot_executed) {
            pivotInstruction = `[ALERTA MÁXIMO - PIVOT DE AUTORIDADE]: Esta é a PRIMEIRA resposta do lead! Abandone a postura inicial de "curiosidade" ("são vocês que gerenciam?"). Assuma IMEDIATAMENTE a postura de Especialista e Autoridade (Lucas, Co-Fundador da Hubica). O lead já engajou. Comece a conduzir a conversa para a apresentação da plataforma.\n`;
            leadUpdated.metadata.is_pivot_executed = true;
            await updateLeadMetadata(leadUpdated.id, leadUpdated.metadata);
            console.log(`🔄 Pivot de Autoridade executado para @${leadUpdated.handle}`);
        }

        const enrichedMessage = `${pivotInstruction}${intentInstruction ? `[INSTRUÇÃO INTERNA: ${intentInstruction}]\n` : ''}${objectionResponse ? `[ARGUMENTO SUGERIDO: "${objectionResponse}"]\n` : ''}${couponBlock}Mensagem do cliente: ${msg.body}`;

        const leadContext = {
            handle: leadUpdated.handle,
            followers: leadUpdated.metadata?.followers,
            posts: leadUpdated.metadata?.posts,
            bio: leadUpdated.metadata?.bio,
            niche: leadUpdated.metadata?.niche,
        };

        // ENFILEIRA A MENSAGEM NO PROCESSADOR AO INVÉS DE PROCESSAR AQUI
        console.log(`🧠 Acionando o cérebro e enfileirando resposta...`);
        messageQueue.push({ msg, lead: leadUpdated, history, enrichedMessage, leadContext, conversationSummary });
        
        // Dispara o trabalhador da fila
        processMessageQueue();

    } catch (err) {
        console.error('❌ [ERRO INBOUND] Exceção na handleInboundMessage:', err.message, err.stack);
    }
}

// Escuta mensagens recebidas (Inbound)
client.on('message', handleInboundMessage);

// --- NOVO: DETECÇÃO DE INTERVENÇÃO HUMANA ---
client.on('message_create', async (msg) => {
    // Se a mensagem for minha (do bot/conta hubica) e não tiver sido enviada pelo motor do bot
    // (Podemos identificar isso porque o bot envia em chunks e usa marcadores, mas a forma
    // mais segura é marcar o lead assim que detectamos atividade humana no chat)
    if (msg.fromMe) {
        // Resolve o destinatário
        let targetPhone = msg.to;
        if (targetPhone.includes('@lid')) {
            try { const contact = await msg.getContact(); targetPhone = `${contact.number}@c.us`; } catch (_) { }
        }

        // Não desativa se a mensagem for para o próprio closer humano (notificação)
        if (targetPhone === HUMAN_CLOSER_NUMBER) return;

        const lead = await findLeadByPhone(targetPhone);
        if (lead && lead.metadata?.active_bot !== false && !msg.body.startsWith('🔥 *LEAD QUENTE')) {
            console.log(`🤝 [HUMAN INTERVENTION] Detectada mensagem manual para @${lead.handle}. Desativando bot.`);
            lead.metadata.active_bot = false;
            lead.metadata.human_intervened = true;
            await updateLeadMetadata(lead.id, lead.metadata);
        }
    }
});



// --- NOVO: LÓGICA DE WARM-UP (AQUECIMENTO ESCALONADO) ---
const START_DATE = new Date('2026-03-12'); 
function getDailyLimit() {
    const now = new Date();
    const diffDays = Math.floor((now - START_DATE) / (1000 * 60 * 60 * 24));
    // Começa com 50 e mantém. Se o limite máximo for aumentado futuramente, ele crescerá 5 por dia.
    const effectiveLimit = Math.min(50 + (diffDays * 5), DAILY_LIMIT_MAX);
    return effectiveLimit;
}

// ==========================================
// PROCESSO 1: COLD APPROACH (PROSPECÇÃO FRIA)
// ==========================================
async function coldApproachEngine() {
    try {
        const check = await canProcess();
        if (!check.allowed) {
            // Se for apenas ocupado, tenta de novo logo. Se for horário/limite, espera mais.
            const retryTime = check.reason === "Ocupado com outro processo" ? 30000 : 300000;
            setTimeout(coldApproachEngine, retryTime);
            return;
        }

        isProcessing = true;
        console.log(`[${new Date().toLocaleTimeString()}] 🔍 Verificando leads para Cold Approach...`);
        const pendingLeads = await getPendingLeads(1);
        
        if (pendingLeads && pendingLeads.length > 0) {
            const lead = pendingLeads[0];
            let phone = lead.metadata?.whatsapp || lead.metadata?.phone;
            
            if (phone) {
                // --- NOVO: SANITIZAÇÃO 100% (LIMPEZA TOTAL) ---
                phone = phone.toString().replace(/\D/g, ''); // Remove tudo que não for número
                
                const chatId = `${phone}@c.us`;
                const isRegistered = await client.isRegisteredUser(chatId);
                
                if (!isRegistered) {
                    console.log(`⚠️ Número inválido: ${phone}. Pulando.`);
                    await updateLeadState(lead.id, 'lost', { error: 'No WhatsApp account found' });
                } else {
                    console.log(`🏹 Preparando Isca para @${lead.handle} (${phone})...`);
                    const draftMsg = lead.metadata?.whatsapp_draft || lead.metadata?.contactor_draft || getIntentInstruction('', lead.intent);
                    const iscaChunks = draftMsg.split(/\|/).filter(c => c.trim().length > 0);
                    
                    for (const chunk of iscaChunks) {
                        const textToSend = chunk.trim();
                        const chat = await safeGetChat(chatId);
                        
                        if (chat) {
                            chat.sendStateTyping();
                            const baseTypingTime = Math.min(textToSend.length * TYPING_DELAY_PER_CHAR, 8000);
                            const typingTime = addJitter(baseTypingTime);
                            await new Promise(res => setTimeout(res, typingTime));
                        }
                        
                        try {
                            await client.sendMessage(chatId, textToSend);
                            if (chat) chat.clearState();
                        } catch (err) {
                            console.error(`Erro ao disparar para ${phone}:`, err.message);
                        }
                    }
                    
                    // Marca que a isca foi enviada para não repetir no próximo ciclo
                    lead.metadata.whatsapp_isca_sent = true;
                    
                    // Se o lead já estava como 'nurtured' (pelo Hunter), mantém 'nurtured'
                    // Caso contrário, move para 'outreached' (isca enviada)
                    const nextState = lead.current_state === 'nurtured' ? 'nurtured' : 'outreached';

                    await updateLeadState(lead.id, nextState, { 
                        last_interaction: new Date().toISOString(),
                        outreach_timestamp: new Date().toISOString(),
                        metadata: lead.metadata
                    });
                    dailySentCount++;
                }
            }
        }
    } catch (err) {
        console.error("Erro no motor de Cold Approach:", err);
    } finally {
        isProcessing = false;
        setTimeout(coldApproachEngine, OUTBOUND_INTERVAL()); 
    }
}

// ==========================================
// PROCESSO 2: AUTO FOLLOW-UP (BUMP 24H)
// ==========================================
async function followUpEngine() {
    try {
        const check = await canProcess();
        // Para follow-up, somos mais tolerantes com "Pausas", mas não com limites
        if (!check.allowed && check.reason !== "Pausa para café" && check.reason !== "Pausa para almoço") {
            setTimeout(followUpEngine, 300000);
            return;
        }

        isProcessing = true;
        const followUpLeads = await getLeadsForFollowUp();
        
        if (followUpLeads && followUpLeads.length > 0) {
            const lead = followUpLeads[0];
            
            // 🔥 SEGURANÇA: Só faz follow-up se a ÚLTIMA mensagem foi do BOT
            // Se a última foi do cliente, significa que o Inbound está processando ou falhou.
            // Não queremos mandar um "conseguiu ver?" se ele acabou de falar algo.
            const history = lead.metadata?.chat_history || [];
            if (history.length > 0) {
                const lastMsg = history[history.length - 1];
                if (lastMsg.role === 'client') {
                    console.log(`⏳ @${lead.handle} mandou mensagem recentemente (ou Inbound pendente). Pulando follow-up.`);
                    return;
                }
            }

            let phone = lead.metadata?.whatsapp;
            if (phone) phone = phone.toString().replace(/\D/g, ''); // Limpeza total
            const chatId = `${phone}@c.us`;

            try {
                console.log(`🔔 Enviando follow-up 24h para @${lead.handle}...`);
                
                // Passa a intenção do lead (se existir no metadata)
                const lastIntent = lead.metadata?.intent || 'MORNO';
                const followUpMsg = getRandomFollowUp(lastIntent);
                
                const chat = await safeGetChat(chatId);
                if (chat) {
                    chat.sendStateTyping();
                    await new Promise(res => setTimeout(res, addJitter(4000)));
                }
                
                await client.sendMessage(chatId, followUpMsg);
                if (chat) chat.clearState();
                
                lead.metadata.follow_up_sent = true;
                await updateLeadMetadata(lead.id, lead.metadata);
                
                dailySentCount++;
            } catch (err) {
                console.error(`Erro no follow-up para @${lead.handle}:`, err.message);
            }
        }
    } catch (err) {
        console.error("Erro no motor de Follow-up:", err);
    } finally {
        isProcessing = false;
        setTimeout(followUpEngine, getRandomDelay(20 * 60 * 1000, 45 * 60 * 1000));
    }
}

// --- NOVO: KILL SWITCH E ALERTA DE BANIMENTO ---
client.on('disconnected', async (reason) => {
    console.error(`☠️ [CRÍTICO] Cliente WhatsApp desconectado. Motivo: ${reason}`);

    if (['NAVIGATION', 'BANNED', 'CONFLICT'].includes(reason)) {
        try {
            const webhookUrl = process.env.CRITICAL_ALERT_WEBHOOK;
            
            if (webhookUrl) {
                // Enviando o alerta para o seu número via Webhook externo
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: "5511980150905",
                        message: `🚨 *ALERTA HUBICA*\nO bot foi desconectado/banido.\nMotivo: ${reason}\nSistema encerrado.`
                    })
                });
                console.log('✅ Notificação de emergência disparada com sucesso.');
            }
        } catch (err) {
            console.error('❌ Falha ao enviar notificação externa de banimento:', err.message);
        } finally {
            console.error('🛑 Executando Kill Switch (process.exit(1))...');
            process.exit(1);
        }
    }
});

// Inicia o processo
client.initialize();
