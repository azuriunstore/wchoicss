# Plano aprovado — Wchoicss Notes no Manus

## Objetivo
Criar uma cópia fiel do repositório público `artzencontented/wchoicss-notes` em um novo projeto Manus WebDev, preservando implementação, conteúdo, estrutura, aparência e comportamento, e disponibilizá-la como site permanente.

## Escopo confirmado
- Importar integralmente o código e os arquivos do repositório de origem para um workspace novo, mantendo o repositório GitHub original inalterado.
- Executar a mesma aplicação React, Vite, Express, TypeScript, Three.js e Tailwind, com suas dependências e configurações originais.
- Manter mural de notas, login local, sincronização com MySQL, cache offline, busca, filtros, lixeira, restauração e exportação JSON.
- Publicar com o `Dockerfile`, servidor Manus e banco MySQL gerenciado; o banco será exclusivo desta cópia.

## Implementação e infraestrutura
- O front-end continua em `src/`; a API Express e regras de sessão em `server/`; o schema idempotente permanece em `server/migrate.ts` e `db/migrations/`.
- O ambiente Manus fornece `DATABASE_URL` e `MANUS_JWT_SECRET`; a senha do usuário local é mantida somente no armazenamento protegido como `WCHOICSS_PASSWORD`.
- No primeiro start publicado, a migração cria o schema e o script de seed provisiona o usuário local `wchoicss` com hash scrypt e salt. Reinícios preservam as notas no banco gerenciado.
- O container expõe a aplicação na porta 3000 e responde em `/api/health`. A rota de interface declarada é `/`.

## Fidelidade visual e de produto
- **Movimento de design:** preservar a estética digital imersiva do projeto original, com fundo WebGL cromático e painel de notas em alto contraste.
- **Princípios:** identidade visual intacta; interface de notas diretamente utilizável; animação de fundo discreta; leitura priorizada sobre ornamentos novos.
- **Cores e tipografia:** manter a paleta escura, os acentos cromáticos e as hierarquias tipográficas do código importado, sem redesenho ou substituição de marca.
- **Elementos de assinatura:** shader WebGL em tela cheia, superfícies translúcidas das notas e frase filosófica randômica.
- **Interação e animação:** preservar comportamentos, rótulos, cache local e transições existentes; nenhum recurso visual adicional será introduzido.
- **Essência da marca:** um mural pessoal de notas visualmente expressivo, para registrar e organizar pensamentos com continuidade offline.

## Interligação visual entre notas
- As notas continuam sendo armazenadas no mesmo campo de texto, sem migração destrutiva: uma referência no formato `[[Título da nota]]` é a fonte da conexão.
- O formulário de nota não exibe mais o seletor “Inserir ligação entre notas”; referências `[[Título da nota]]`, quando usadas em conteúdo existente, continuam sendo resolvidas pelo sistema de links.
- Referências resolvidas aparecem como links clicáveis no corpo das notas; referências ainda inexistentes permanecem visíveis como pendentes.
- O “Mapa de linhas” funciona como um canvas interativo: cartões podem ser arrastados, a alça `↗` de um cartão pode ser arrastada até outro para criar uma linha direcionada, linhas acompanham os cartões e uma linha selecionada pode ser excluída. Duplo clique em um cartão abre a nota.

## Mural livre e posições persistentes
- O mural principal deixa de ser uma grade fixa e passa a renderizar cada nota como um bloco manipulável em um canvas livre.
- O usuário pode arrastar qualquer área livre do bloco; ao soltar, as coordenadas `x/y` são gravadas no cache offline e sincronizadas com o MySQL gerenciado.
- A API e a migração adicionam `position_x` e `position_y` de forma aditiva, preservando notas antigas sem posição e calculando um arranjo inicial para elas.
- O botão global “Mapa de linhas (0)” não aparece mais no mural e nenhuma seção contextual “Linha” é aberta ao clicar em um bloco; o mural fica dedicado a mover e organizar as notas.
- O quadrante do mural ocupa toda a largura disponível e uma altura proporcional à janela do dispositivo, com limites responsivos e coordenadas de arrasto recalculadas para o tamanho real da área.

## Editor SVG de conectores
- O canvas de linhas usa SVG e oferece três geometrias selecionáveis: reta, cotovelo ortogonal com cantos arredondados e curva Bézier cúbica.
- Cada nota/forma apresenta âncoras de topo, base, esquerda e direita ao passar o mouse; arrastar uma âncora até outra forma cria um conector aderente.
- O painel do conector configura ponta inicial e final (nenhuma, seta, seta vazada ou círculo), traço contínuo/tracejado/pontilhado, espessura e cor.
- O conector tem rótulo editável, é selecionável pelo traço e exibe alças de ponta para reconectar e alça central para ajustar o cotovelo ou a curvatura.
- As linhas acompanham os cartões em tempo real e os estilos ficam no armazenamento local do usuário, preservando a experiência ao reabrir o editor.

## Sessões de organização
- A navegação principal usa abas fixas: **📌 Geral - Todas**, **✅ Tarefas**, **💡 Ideias**, **📚 Estudos**, **💼 Trabalho**, **📅 Planejamento**, **📖 Diário** e **🗑️ Lixeira**.
- Geral - Todas mostra todas as notas ativas, independentemente da categoria; cada sessão de categoria filtra as notas pelo campo `category`; Lixeira mostra somente notas removidas.
- As abas têm estado visual ativo, rolagem horizontal em telas estreitas e substituem os filtros dinâmicos/controles duplicados de Mural e Lixeira.
- Ao criar ou editar uma nota, o campo “Categoria da sessão” é um seletor com Tarefas, Ideias, Estudos, Trabalho, Planejamento e Diário; a escolha determina em qual aba a nota aparece.
- O botão visível `↑ Enviar arquivo`, ao lado de “+ Nova nota”, aceita qualquer tipo de arquivo (`*/*`) e múltiplos itens; cada arquivo é enviado como bytes ao armazenamento durável, sem conversão para texto, mantendo nome, MIME, tamanho e formato original para abertura/download na nota.

## Estrutura do projeto
| Caminho | Responsabilidade |
| --- | --- |
| `src/App.tsx` | Login, mural, lixeira, cache, sincronização e backup |
| `src/` | Interface React, dados de frases e estilos da aplicação |
| `server/auth.ts` | Autenticação local, scrypt, sessão HttpOnly e proteção de origem |
| `server/index.ts` | Servidor Express e API de notas |
| `server/db.ts` | Conexão com MySQL gerenciado |
| `server/migrate.ts` | Migração de schema idempotente |
| `server/seed-local-user.ts` | Provisionamento seguro do usuário local inicial |
| `public/manus-routes.json` | Manifesto de rota da interface |
| `Dockerfile` | Build e publicação em container |
