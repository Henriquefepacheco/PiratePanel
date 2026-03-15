const readline = require('readline');
const { generateResponse, summarizeHistory } = require('./geminiBrain');
const { classifyIntent, getIntentInstruction } = require('./intentClassifier');
const { detectObjection } = require('./sales_bible/objections');
const { createLeadCoupon, checkExistingCoupon } = require('./stripeActions');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// === MOCK DE CONTEXTO DE LEAD (simula o que viria do Supabase) ===
// Edite aqui para testar diferentes perfis de lead!
const leadContextMock = {
    handle: 'dra_carla_odonto',
    followers: '4.200',
    posts: '87',
    bio: 'Cirurgiã-dentista | Estética dental | São Paulo 🦷',
    niche: 'odonto'
};

let chatHistory = [];
let conversationSummary = null;
let activeCoupon = null; // Cupom Stripe criado para este lead (evita duplicatas)
let coldIntentStreak = 0; // Contador de intenções frias consecutivas (para gatilho de retenção)

// === FILTRO DE PROMPT INJECTION ===
const injectionPatterns = [
    /SYSTEM_UPDATE/i, /ignore (as|todas as|suas|previous|all) (instruç|instruction|regras)/i,
    /\[SYSTEM/i, /a partir de agora (você|vc|seu|seu papel)/i,
    /(novo protocolo|new protocol)/i, /(finja ser|aja como|pretend to be|roleplay as)/i,
    /(mascote|persona|galinha|animal|imita)/i, /(overwrite|sobrescreve|override).*(prompt|instrução|sistema)/i,
];

console.log("==========================================");
console.log("🧠 SIMULADOR THE CLOSER v2.0 — MODO AVANÇADO 🧠");
console.log("==========================================");
console.log(`🎯 Lead simulado: @${leadContextMock.handle} | ${leadContextMock.followers} seguidores | ${leadContextMock.niche}`);
console.log("Para sair, digite 'sair'. Para ver o histórico, 'historico'.\n");

async function askQuestion() {
    rl.question("Você (Cliente) 💬: ", async (customerInput) => {
        const cmd = customerInput.toLowerCase().trim();
        if (cmd === 'sair' || cmd === 'exit') { rl.close(); return; }
        if (cmd === 'historico') {
            console.log("\n--- HISTÓRICO ---");
            chatHistory.forEach(m => console.log(`[${m.role}] ${m.text}`));
            console.log("--- FIM ---\n");
            return askQuestion();
        }

        // Gerenciamento de Memória Longa (Melhoria 4)
        if (chatHistory.length >= 10 && !conversationSummary) {
            console.log("🧠 [Memória] Histórico longo detectado. Gerando resumo...");
            conversationSummary = await summarizeHistory(chatHistory);
            if (conversationSummary) {
                chatHistory = []; // Limpa histórico e reinicia com o resumo
                console.log(`🧠 [Memória] Resumo gerado: "${conversationSummary.substring(0, 80)}..."\n`);
            }
        }

        // Filtro de Injeção (Escudo)
        if (injectionPatterns.some(p => p.test(customerInput))) {
            console.log(`\n==========================================`);
            console.log(`🤖 The Closer 📤: ?`);
            console.log(`==========================================\n`);
            return askQuestion();
        }

        // Melhoria 5: Detecção de Intenção
        const intent = await classifyIntent(customerInput);
        const intentInstruction = getIntentInstruction(intent);
        console.log(`\n🔍 Intenção Detectada: [${intent}]`);

        // Melhoria 2: Detecção de Objeção
        const objectionResponse = detectObjection(customerInput);
        if (objectionResponse) {
            console.log(`💡 Objeção Detectada! Injetando argumento da Bíblia...`);
        }

        chatHistory.push({ role: 'client', text: customerInput, timestamp: new Date().toISOString() });

        console.log("🤖 The Closer processando...\n");

        try {
            // === GATILHO DE CUPOM STRIPE (RETENÇÃO) ===
            // Dispara cupom em 3 cenários:
            // 1. Intenção FRIO/HOSTIL + menção explícita de preço
            // 2. 2+ respostas FRIAS consecutivas (insistência = cliente escapando)
            // 3. Intenção HOSTIL direta (cliente prestes a sair)
            const isPriceObjection = /caro|preço|custo|barato|desconto|valor/i.test(customerInput);

            // Atualiza o contador de sequência fria
            if (intent === 'FRIO' || intent === 'HOSTIL') {
                coldIntentStreak++;
            } else {
                coldIntentStreak = 0; // Reseta se o cliente se reaquecer
            }

            const shouldCreateCoupon = !activeCoupon && (
                (isPriceObjection && (intent === 'FRIO' || intent === 'HOSTIL')) || // Cenário 1
                coldIntentStreak >= 2 ||                                             // Cenário 2: insistência
                intent === 'HOSTIL'                                                  // Cenário 3: prestes a sair
            );

            let couponInfo = null;
            if (shouldCreateCoupon) {
                console.log(`💳 [Stripe] 🚨 Risco de perder o cliente (streak:${coldIntentStreak}, intent:${intent}). Criando cupom de retenção...`);
                const newCoupon = await createLeadCoupon(leadContextMock.handle, 20);
                if (newCoupon) {
                    activeCoupon = newCoupon;
                    couponInfo = newCoupon;
                    console.log(`💳 [Stripe] Cupom criado: ${newCoupon.couponCode} (${newCoupon.percentOff}% OFF)`);
                }
            } else if (activeCoupon && isPriceObjection) {
                couponInfo = activeCoupon; // Reutiliza o cupom já criado
            }
            // ==========================================

            // Monta a mensagem enriquecida com contexto de intenção + objeção (invisível pro cliente)
            const couponBlock = couponInfo
                ? `[CUPOM STRIPE CRIADO COM SUCESSO: Use o código "${couponInfo.couponCode}" para dar 20% de desconto. O link completo para o cliente é: ${couponInfo.checkoutUrl}. Apresente este cupom como exclusivo, que você conseguiu especialmente para ele.]\n`
                : '';

            const enrichedMessage = intentInstruction
                ? `[INSTRUÇÃO INTERNA: ${intentInstruction}]\n${objectionResponse ? `[ARGUMENTO SUGERIDO PARA OBJEÇÃO: "${objectionResponse}"]\n` : ''}${couponBlock}Mensagem do cliente: ${customerInput}`
                : `${couponBlock}${customerInput}`;

            // Melhoria 3 + 4: Passa contexto do lead e resumo de memória longa
            const botResponse = await generateResponse(chatHistory, enrichedMessage, leadContextMock, conversationSummary);

            console.log(`==========================================`);
            const chunks = botResponse.split(/\||\n/).filter(c => c.trim().length > 0);
            for (const chunk of chunks) {
                const typingTime = Math.min(chunk.length * 40, 1500);
                await new Promise(res => setTimeout(res, typingTime));
                console.log(`🤖 The Closer 📤: ${chunk.trim()}`);
            }
            console.log(`==========================================\n`);

            const cleanResponse = botResponse.replace(/\|/g, " ");
            chatHistory.push({ role: 'hubica_closer', text: cleanResponse, timestamp: new Date().toISOString() });

        } catch (err) {
            console.error("Erro na comunicação com a IA:", err);
        }

        askQuestion();
    });
}

askQuestion();
