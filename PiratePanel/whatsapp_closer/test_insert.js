const { supabase } = require('./supabaseClient');

async function insertTestLead() {
    const newLead = {
        handle: "@teste_zap_cto",
        platform: "instagram",
        current_state: "qualified",
        metadata: {
            niche: "odonto",
            name: "Contato Teste",
            followers: "2.500",
            posts: "64",
            bio: "Profissional Liberal | São Paulo",
            whatsapp: "5511980150905",
            whatsapp_ready: true,
            whatsapp_draft: "Boa tarde! Vi seu perfil no Instagram e achei que a Hubica poderia te ajudar bastante.|Aqui é o Lucas, consultor da Hubica — trabalhamos com um assistente de marketing com IA que cria conteúdo profissional e garante que tudo esteja dentro das regras da sua área.|Me conta rapidinho: sua maior barreira hoje é tempo pra gravar ou falta de roteiro?"
        }
    };

    // Limpa o antigo se existir
    const { data: existing } = await supabase.from('leads').select('id').eq('handle', '@teste_zap_cto');
    if (existing && existing.length > 0) {
        console.log("Limpando lead de teste antigo...");
        await supabase.from('leads').delete().eq('handle', '@teste_zap_cto');
    }

    const { error, data } = await supabase.from('leads').insert([newLead]).select();
    if (error) {
        console.error("Erro ao inserir: ", error);
    } else {
        console.log("🎯 Lead de teste OUTBOUND injetado com sucesso no CRM com a NOVA REGRA WPP!");
        console.log("Número alvo:", data[0].metadata.whatsapp);
    }
    process.exit(0);
}
insertTestLead();
