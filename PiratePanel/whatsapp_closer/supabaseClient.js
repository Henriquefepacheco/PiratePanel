const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // caminho absoluto

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERRO: Chaves SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não encontradas no .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Busca leads qualificados que ainda não receberam mensagem no WhatsApp.
 */
async function getPendingLeads(limit = 10) {
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .or('current_state.eq.qualified,current_state.eq.nurtured') // Aceita os dois estados
        .eq('metadata->>whatsapp_ready', 'true')
        .is('metadata->whatsapp_isca_sent', null) // Só se ainda não mandou a isca no WhatsApp
        .not('metadata->>whatsapp', 'is', 'null')
        .gte('metadata->>whatsapp', '10000000') 
        .limit(limit);

    if (error) {
        console.error("Erro ao buscar leads pendentes:", error);
        return [];
    }
    return data;
}

/**
 * Atualiza o status de um lead no CRM
 */
async function updateLeadState(leadId, newState, additionalFields = {}) {
    const updateData = { 
        current_state: newState,
        last_interaction: new Date().toISOString(), // Sempre atualiza interaction ao mudar estado
        ...additionalFields
    };
    
    const { data, error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId)
        .select();

    if (error) {
        console.error(`Erro ao atualizar lead ${leadId} para status ${newState}:`, error);
        return null;
    }
    return data;
}

/**
 * Salva o histórico de conversa dentro do objeto metadata do Lead
 */
async function appendConversationHistory(leadId, metadata, role, text) {
    let chatHistory = metadata.chat_history || [];

    chatHistory.push({
        role: role,
        text: text,
        timestamp: new Date().toISOString()
    });

    const newMetadata = {
        ...metadata,
        chat_history: chatHistory
    };

    const { error } = await supabase
        .from('leads')
        .update({ 
            metadata: newMetadata,
            last_interaction: new Date().toISOString()
        })
        .eq('id', leadId);

    if (error) {
        console.error("Erro ao salvar histórico de chat:", error);
    }
}

/**
 * Busca um Lead pelo número de telefone (Inbound Matcher)
 */
async function findLeadByPhone(phoneNumber) {
    const rawNumber = phoneNumber.split('@')[0];
    const suffix = rawNumber.slice(-8);

    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .ilike('metadata->>whatsapp', `%${suffix}`)
        .limit(1);

    if (error || !data || data.length === 0) {
        return null;
    }
    return data[0];
}

/**
 * Busca leads que precisam de follow-up (24h+ sem resposta após conversa iniciada)
 */
async function getLeadsForFollowUp() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('current_state', 'nurtured') 
        .is('metadata->active_bot', null) 
        .eq('metadata->>whatsapp_isca_sent', 'true') // Só dá "bump" se já mandamos a primeira
        .is('metadata->follow_up_sent', null)
        .lt('last_interaction', twentyFourHoursAgo);

    if (error) {
        console.error("Erro ao buscar leads para follow-up:", error);
        return [];
    }
    
    return (data || []).filter(lead => lead.metadata?.active_bot !== false);
}

/**
 * Atualiza apenas o metadata do lead
 */
async function updateLeadMetadata(leadId, newMetadata) {
    const { error } = await supabase
        .from('leads')
        .update({ metadata: newMetadata })
        .eq('id', leadId);

    if (error) {
        console.error(`Erro ao atualizar metadata do lead ${leadId}:`, error);
        return false;
    }
    return true;
}

module.exports = {
    supabase,
    getPendingLeads,
    updateLeadState,
    appendConversationHistory,
    findLeadByPhone,
    getLeadsForFollowUp,
    updateLeadMetadata
};
