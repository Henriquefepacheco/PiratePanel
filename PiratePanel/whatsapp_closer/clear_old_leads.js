const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearOldLeads() {
    console.log("Limpando leads antigos que não têm 'whatsapp_draft'...");
    
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .eq('current_state', 'qualified');

    if (error) {
        console.error("Erro ao buscar leads:", error);
        return;
    }

    let count = 0;
    for (const lead of leads) {
        // Se o lead não tem whatsapp_draft, ele foi gerado pelo código antigo
        if (!lead.metadata || !lead.metadata.whatsapp_draft) {
            await supabase.from('leads').delete().eq('id', lead.id);
            count++;
        }
    }
    
    console.log(`🧹 Limpeza concluída! ${count} leads antigos deletados.`);
}

clearOldLeads();
