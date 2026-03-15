/**
 * 🕷️ HUNTER LOOP LOCAL — Roda o Python Hunter a cada X minutos
 * Este script agora usa 'exec' assíncrono para permitir que o output seja transmitido em tempo real.
 */

import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INTERVAL_MINUTES = 20;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;
const scriptPath = join(__dirname, 'autonomous_agents.py');

let isRunning = false;

function runHunter() {
    if (isRunning) {
        console.log(`[${new Date().toLocaleTimeString('pt-BR')}] 🟡 Rodada anterior do Hunter ainda em execução. Pulando este ciclo.`);
        return;
    }
    
    isRunning = true;
    const now = new Date().toLocaleTimeString('pt-BR');
    console.log(`\n[${now}] 🚀 Iniciando rodada do Hunter...`);

    const command = `python -u "${scriptPath}"`;
    console.log(`[SYSTEM] Executing: ${command}`);
    const child = exec(command);

    child.on('error', (err) => {
        console.error(`[SYSTEM ERROR] Failed to start Hunter process: ${err.message}`);
        isRunning = false;
    });

    // Transmite a saída do script python para o console deste script
    child.stdout.on('data', (data) => {
        process.stdout.write(data.toString());
    });

    child.stderr.on('data', (data) => {
        process.stderr.write(data.toString());
    });

    child.on('close', (code) => {
        isRunning = false;
        if (code === 0) {
            console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ Rodada do Hunter concluída com sucesso.`);
        } else {
            console.error(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ Rodada do Hunter falhou com código de saída: ${code}`);
        }
    });
}

// Roda imediatamente e depois no intervalo definido
runHunter();
setInterval(runHunter, INTERVAL_MS);

console.log(`\n⏱️  Hunter local agendado para executar a cada ${INTERVAL_MINUTES} minutos.`);
console.log(`⛔ Para parar o agendador, feche este processo.\n`);
