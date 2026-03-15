const { Client, LocalAuth } = require('whatsapp-web.js');

console.log("🛠️ Iniciando Teste Direto do WhatsApp Closer...");
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => {
    console.log('📱 Leia o QR Code com o WhatsApp para este teste (se necessário):');
    const qrcode = require('qrcode-terminal');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Cliente conectado! Disparando teste...');
    const targetPhone = '5511980150905'; // Forçando o formato BR conforme pedido '11980150905'
    const chatId = `${targetPhone}@c.us`;
    
    // Testa se o número existe mesmo no Whatsapp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
        console.log(`❌ Número Inativo ou Inválido no WhatsApp: ${targetPhone}`);
        process.exit(1);
    }
    
    const mensagens = [
        "Fala Henrique, testando a Fila do WhatsApp Closer!",
        "Se essa mensagem chegou pra você e a formatação e os timers biológicos estiverem on, a gente tá 100% pronto."
    ];
    
    for (const msg of mensagens) {
        await client.sendMessage(chatId, msg);
        console.log(`📤 Enviou balão de teste: "${msg}"`);
        await new Promise(r => setTimeout(r, 1500));
    }
    
    console.log("🎉 Teste Unitário concluído com sucesso!");
    process.exit(0);
});

client.initialize();
