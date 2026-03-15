const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '../../.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Classifica a intenção do cliente em uma de * Categorias:
 * QUENTE    — Demonstra interesse real, pergunta sobre preço, como acessar/assinar
 * MORNO     — Engajado mas com dúvidas, precisa de mais informação, conversando normalmente
 * FRIO      — Pouco interesse, resposta curta ou evasiva ("ok", "legal")
 * HOSTIL    — Objeção agressiva, irritação, "não quero", "para de me encher"
 * AUTO      — Resposta automática de ausência, saudação de empresa, bot ou "auto-reply"
 * IRRELEVANTE — Mensagem não relacionada à conversa de vendas
 */
async function classifyIntent(message) {
    const classifierModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Você é um classificador de intenção de leads em vendas.
Classifique a mensagem abaixo em UMA das categorias. Responda SOMENTE com a palavra da categoria, sem explicação.

Categorias:
- QUENTE: lead demonstra interesse explícito, pergunta "como funciona?", "qual o valor?", "tem link?", "quero testar", "como eu assino?"
- MORNO: lead está engajado mas com dúvidas gerais, responde com interesse moderado, mas não pediu preço ainda.
- FRIO: lead pouco engajado, resposta curta, evasivo, "ok", "entendi", "vou pensar", "tá bom"
- HOSTIL: objeção agressiva, irritação, "não tenho interesse", "para de me encher", "sai fora", "caro demais"
- AUTO: resposta automática de ausência, mensagem de boas-vindas de bot, "como posso ajudar?", ou texto padrão de auto-atendimento
- IRRELEVANTE: mensagem não relacionada à venda (emojis aleatórios, spam, texto sem sentido, pergunta totalmente fora do contexto)

Mensagem: "${message}"

Categoria:`;

    try {
        const result = await classifierModel.generateContent(prompt);
        const intent = result.response.text().trim().toUpperCase();

        // Valida que é uma das categorias esperadas
        const validIntents = ['QUENTE', 'MORNO', 'FRIO', 'HOSTIL', 'AUTO', 'IRRELEVANTE'];
        if (validIntents.includes(intent)) return intent;
        return 'UNKNOWN'; // Fallback seguro
    } catch (e) {
        return 'UNKNOWN'; // Fallback em caso de erro
    }
}

/**
 * Gera a instrução adicional de comportamento baseada na intenção detectada ou na Persona
 */
function getIntentInstruction(leadResponse = '', intent = 'MORNO') {
    const text = leadResponse.toLowerCase();

    const personas = {
        'GATEKEEPER': {
            triggers: ['secretaria', 'atendente', 'passar para', 'ajudante', 'recepção', 'secretária', 'clinica'],
            instruction: "Mude o objetivo: Peça o contato do decisor ou e-mail para enviar material técnico."
        },
        'AGENCIA': {
            triggers: ['agencia', 'terceirizado', 'marketing', 'social media', 'agência', 'assessoria'],
            instruction: "Mude o objetivo: Venda a Hubica como ferramenta de escala White Label para a agência."
        },
        'DONO': {
            triggers: ['eu mesmo', 'faço sozinho', 'minha equipe', 'sou eu', 'nós mesmos', 'eu que faço'],
            instruction: "Execute o Pitch Direto: Foco em economia de tempo e o plano Platinum (R$ 97,90)."
        }
    };

    // Lógica de Pivot - Gatekeeper Protocol
    for (const [persona, data] of Object.entries(personas)) {
        if (data.triggers.some(trigger => text.includes(trigger))) {
            return `[ROTEAMENTO DE PERSONA - ${persona}]: ${data.instruction}`;
        }
    }

    const instructions = {
        'QUENTE': `[⚠️ ALERTA MÁXIMO DE VENDA ⚠️]: O lead está QUENTE. Ele quer comprar. Não faça rodeios. ENTREGUE O PREÇO DO PLANO PLATINUM IMEDIATAMENTE e mande o link "https://hubica.com.br" para ele assinar. Exerça FOMO (Fear Of Missing Out). Diga algo como: "O Platinum sai a R$97,90 e te poupa horas. O link pra liberar seu acesso agora é https://hubica.com.br. Bora iniciar e já deixar seus posts prontos hoje mesmo?"`,
        'MORNO': `[INSTRUÇÃO DE VENDAS]: O lead está MORNO. Use o framework PAS (Problema, Agitação, Solução). Faça uma pergunta investigativa sobre o problema dele (ex: "Hoje você mesmo faz os posts ou delega?"). Se ele perguntar algo da ferramenta, responda rápido e já jogue a próxima pergunta investigativa.`,
        'FRIO': `[INSTRUÇÃO DE VENDAS]: O lead está FRIO ou evasivo. Use um padrão de interrupção ou escassez. Diga algo que o provoque educadamente. Exemplo: "Assumo que criar conteúdo não seja uma prioridade pro seu negócio agora, certo? Sem problemas! Se quiser que eu te mostre como fazer isso em 5 min depois, me avisa."`,
        'HOSTIL': `[INSTRUÇÃO DE VENDAS]: O lead está HOSTIL ou com objeção forte. Isole a objeção e concorde com ele (Acalme-o). Exemplo: "Entendo perfeitamente, o tempo de todo mundo tá corrido. Posso só deixar o site aqui pra quando você estiver mais livre?"`,
        'AUTO': `ATENÇÃO: Resposta automática detectada. Ignore.`,
        'IRRELEVANTE': `ATENÇÃO: A mensagem é IRRELEVANTE. Traga gentilmente o assunto de volta para a ferramenta de criação de posts.`,
    };
    return instructions[intent] || '';
}

module.exports = { classifyIntent, getIntentInstruction };
