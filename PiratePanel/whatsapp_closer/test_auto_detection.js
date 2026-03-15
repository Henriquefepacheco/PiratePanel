const { classifyIntent } = require('./intentClassifier');

async function runTests() {
    const testCases = [
        { msg: "Bom dia! Como posso ajudar?", expected: "AUTO" },
        { msg: "Olá! Esta é uma mensagem automática de boas-vindas da Clínica Sorriso.", expected: "AUTO" },
        { msg: "Estou em atendimento no momento e responderei em breve.", expected: "AUTO" },
        { msg: "Qual o valor do plano Platinum?", expected: "QUENTE" },
        { msg: "Gostei da ideia, mas preciso falar com meu sócio.", expected: "MORNO" },
        { msg: "Não tenho interesse, por favor não mande mais mensagem.", expected: "HOSTIL" },
        { msg: "Oi, tudo bem?", expected: "MORNO" },
        { msg: "ok", expected: "FRIO" },
        { msg: "🚀🔥💎", expected: "IRRELEVANTE" }
    ];

    console.log("🧪 Iniciando testes de detecção de intenção...\n");

    let passed = 0;
    for (const test of testCases) {
        const result = await classifyIntent(test.msg);
        const isMatch = result === test.expected;
        if (isMatch) passed++;
        
        console.log(`${isMatch ? '✅' : '❌'} Msg: "${test.msg}"`);
        console.log(`   Esperado: ${test.expected} | Resultado: ${result}\n`);
    }

    console.log(`\n📊 Resultado Final: ${passed}/${testCases.length} testes passaram.`);
    
    if (passed === testCases.length) {
        console.log("🚀 Todos os testes passaram com sucesso!");
    } else {
        console.log("⚠️ Alguns testes falharam. Verifique o prompt do classificador.");
    }
}

runTests();
