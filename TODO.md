# Entregas

- [x] Importar integralmente o código e os arquivos do repositório público `https://github.com/artzencontented/wchoicss-notes.git` para um workspace Manus novo, preservando o repositório GitHub de origem.
- [x] Executar a cópia com as tecnologias, dependências e configurações definidas no repositório original, incluindo React, Vite, Express, TypeScript, Three.js, Tailwind, login local e banco MySQL gerenciado.
- [x] Provisionar com segurança o usuário local original `wchoicss`, usando a senha protegida configurada no Manus e hash scrypt no banco desta cópia.
- [x] Adicionar interligação de notas por referências `[[Título da nota]]`, links clicáveis e canvas interativo com cartões arrastáveis, alças para criar linhas visíveis e exclusão de linhas selecionadas; o seletor “Inserir ligação entre notas” foi removido do formulário.
- [x] Transformar o mural principal em um canvas livre onde cada bloco de nota pode ser arrastado e sua posição `x/y` é guardada no cache offline e no banco MySQL para reaparecer no mesmo lugar.
- [x] Remover “Mapa de linhas (0)” da barra global e remover a seção contextual “Linha” que aparecia dentro do bloco ao clicar nele; o clique no mural permanece reservado ao arrasto das notas.
- [x] Fazer o quadrante do mural ocupar 100% da largura disponível e uma altura proporcional ao dispositivo, mantendo o arrasto correto e a rolagem somente quando o conteúdo exceder a área.
- [x] Implementar editor SVG de conectores com linhas reta, em cotovelo arredondado e Bézier; quatro âncoras por forma; reconexão por arraste; pontas configuráveis; traço, espessura, cor, rótulo editável e alças de ponta/meio.
- [x] Criar abas fixas de sessões com `📌 Geral - Todas`, `✅ Tarefas`, `💡 Ideias`, `📚 Estudos`, `💼 Trabalho`, `📅 Planejamento`, `📖 Diário` e `🗑️ Lixeira`, usando filtros de categoria e visual ativo para melhorar a organização.
- [x] Adicionar no formulário de criar/editar nota o seletor “Categoria da sessão”, permitindo escolher Tarefas, Ideias, Estudos, Trabalho, Planejamento ou Diário e posicionar a nota na aba correspondente.
- [x] Fazer a aba `📌 Geral - Todas` exibir todas as notas ativas, independentemente da categoria escolhida; a Lixeira permanece separada.
- [x] Permitir anexar múltiplos arquivos de qualquer formato pelo botão visível `↑ Enviar arquivo`, ao lado de “+ Nova nota”, preservando os bytes, o nome, o tipo MIME e o formato original no armazenamento durável; cada anexo fica disponível na nota para abrir ou baixar.
- [ ] Publicar uma versão permanente e acessível no Manus WebView, com o container validado pelo endpoint `/api/health`.
