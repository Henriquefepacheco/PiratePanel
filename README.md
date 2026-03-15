🏴‍☠️ PiratePanel - Bot Documentation

⚠️ Aviso Legal e Uso Comercial (Dual Licensing)
Este ecossistema de software é disponibilizado publicamente sob a licença CC BY-NC 4.0 (Creative Commons Atribuição-NãoComercial).

Uso Pessoal/Estudos: Você é livre para baixar, estudar e modificar o código estritamente para uso pessoal e aprendizado.

Uso Comercial Estritamente Proibido: É terminantemente proibido utilizar, vender, hospedar ou integrar qualquer parte deste código (incluindo o Hunter, Closer e Terminal) em operações com fins lucrativos, empresas ou prestação de serviços sem autorização expressa.

Licenciamento Comercial / Sociedade: Caso uma empresa ou indivíduo deseje utilizar este sistema para gerar receita, é obrigatória a assinatura de um contrato de licenciamento comercial privado. A liberação do uso comercial está condicionada à negociação de uma porcentagem sobre os lucros da operação e/ou participação societária (equity) na empresa que utilizará a tecnologia. O uso não autorizado para fins comerciais constitui violação de direitos autorais (pirataria) e resultará em medidas legais. Para propostas comerciais, entre em contato diretamente com o autor (Henriquefepacheco).

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


⚙️ Configuração
Renomeie .env.example para .env e insira suas chaves (Supabase, Gemini, Stripe, Instagram).

Instale as dependências:

Python: pip install -r requirements.txt

Node.js: cd whatsapp_closer && npm install

Execute start_terminal.bat para iniciar o PiratePanel.
