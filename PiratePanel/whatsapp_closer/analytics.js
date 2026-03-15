/**
 * Analytics do The Closer — Relatório de Performance de Conversão
 * Execução: node analytics.js
 */
require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runAnalytics() {
    console.log("\n============================================");
    console.log("📊 RELATÓRIO THE CLOSER — PERFORMANCE DE VENDAS");
    console.log("============================================\n");

    // Busca todos os leads que passaram pelo funil
    const { data: leads, error } = await supabase
        .from('leads')
        .select('current_state, metadata, created_at, updated_at')
        .in('current_state', ['outreached', 'nurtured', 'converted', 'lost']);

    if (error) {
        console.error("Erro ao buscar dados:", error.message);
        return;
    }

    if (!leads || leads.length === 0) {
        console.log("📭 Nenhum lead no funil ainda. Rode o bot e volte aqui!");
        return;
    }

    // Estatísticas gerais
    const total = leads.length;
    const byState = leads.reduce((acc, l) => {
        acc[l.current_state] = (acc[l.current_state] || 0) + 1;
        return acc;
    }, {});

    const converted = byState['converted'] || 0;
    const lost = byState['lost'] || 0;
    const inProgress = (byState['outreached'] || 0) + (byState['nurtured'] || 0);
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0;
    const lossRate = total > 0 ? ((lost / total) * 100).toFixed(1) : 0;

    console.log("📈 VISÃO GERAL");
    console.log(`   Total de leads abordados : ${total}`);
    console.log(`   ✅ Convertidos           : ${converted} (${conversionRate}%)`);
    console.log(`   ❌ Perdidos              : ${lost} (${lossRate}%)`);
    console.log(`   🔄 Em negociação         : ${inProgress}`);

    // Estatísticas por nicho
    const byNiche = leads.reduce((acc, l) => {
        const niche = l.metadata?.niche || 'desconhecido';
        if (!acc[niche]) acc[niche] = { total: 0, converted: 0 };
        acc[niche].total++;
        if (l.current_state === 'converted') acc[niche].converted++;
        return acc;
    }, {});

    console.log("\n🎯 CONVERSÃO POR NICHO");
    for (const [niche, data] of Object.entries(byNiche)) {
        const rate = data.total > 0 ? ((data.converted / data.total) * 100).toFixed(1) : 0;
        const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
        console.log(`   ${niche.padEnd(15)} [${bar}] ${rate}% (${data.converted}/${data.total})`);
    }

    // Histórico semanal
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = leads.filter(l => new Date(l.created_at) >= oneWeekAgo);
    const convertedThisWeek = thisWeek.filter(l => l.current_state === 'converted').length;

    console.log(`\n📅 ESTA SEMANA`);
    console.log(`   Leads abordados : ${thisWeek.length}`);
    console.log(`   Conversões      : ${convertedThisWeek}`);

    console.log("\n============================================\n");
}

runAnalytics();
