🏴‍☠️ PiratePanel - Bot Documentation
Este guia explica o funcionamento de cada componente do ecossistema PiratePanel.

1. PirateTerminal (pirate.py)
O centro de comando. Uma interface gráfica em Python (CustomTkinter) que permite monitorar e controlar todos os outros bots.

Visual: Tema "Strict Black" com arte ASCII de caveira e efeitos de glitch dinâmicos.
Controle: Inicia/Para processos em background e exibe logs unificados.
2. Deep WPP Hunter (deep_wpp_hunter.py & run_hunter_loop.js)
O caçador de leads automáticos via WhatsApp.

Funcionamento: Varre grupos e conversas em busca de potenciais clientes com base em filtros configurados.
Integração: Salva os leads diretamente no Supabase para processamento posterior.
Scheduler: O loop em JS garante que a busca seja contínua e resiliente.
3. WhatsApp Closer (whatsapp_closer/index.js)
O bot de fechamento de vendas inteligente.

IA: Utiliza o Google Gemini para entender a intenção do usuário e responder de forma humana.
Sales Bible: Consome scripts de vendas e tratamentos de objeções para converter leads em clientes.
Pagamentos: Integrado ao Stripe para gerar links de checkout e processar vendas automaticamente.
Fluxo: Recebe o lead do Hunter -> Inicia conversa -> Qualifica -> Fecha venda -> Gera Link.
4. Autonomous Agents (autonomous_agents.py)
Scripts auxiliares que gerenciam tarefas de background de forma autônoma, garantindo que o sistema esteja sempre ativo e corrigindo pequenas falhas de conexão ou sincronia.

Configuração
Renomeie .env.example para .env e insira suas chaves (Supabase, Gemini, Stripe, Instagram).
Instale as dependências:
Python: pip install -r requirements.txt
Node.js: cd whatsapp_closer && npm install
Execute start_terminal.bat para iniciar o PiratePanel.
