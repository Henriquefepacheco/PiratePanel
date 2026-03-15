const { getLeadsForFollowUp } = require('./supabaseClient');

async function checkFollowUps() {
    console.log("🔍 Verificando leads elegíveis para follow-up agora...");
    const leads = await getLeadsForFollowUp();
    
    if (leads.length === 0) {
        console.log("✅ Nenhum lead pendente de follow-up no momento.");
    } else {
        console.log(`📈 Encontrados ${leads.length} leads para follow-up:`);
        leads.forEach(l => {
            console.log(`- @${l.handle} (Última interação: ${l.last_interaction})`);
        });
    }
}

checkFollowUps();
