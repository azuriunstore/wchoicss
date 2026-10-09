# Wchoicss Notes

Um mural pessoal de notas com fundo WebGL, login local e salvamento direto no banco de dados.

## Funcionamento

- O login usa o usuário local `wchoicss`.
- A senha é validada no servidor e armazenada somente como hash scrypt com salt.
- Depois do login, as notas abrem diretamente, sem frase mestra ou etapa adicional.
- As notas são salvas em texto normal no banco e no cache local do navegador.
- O cache local permite continuar editando quando a conexão cai; as alterações sincronizam quando voltar.
- Notas apagadas vão para uma lixeira e podem ser restauradas.
- O backup exporta um JSON comum com as notas.

> Como as notas são armazenadas em texto normal, use este site somente em um ambiente e conta em que você confie.

## Recursos

- Salvamento automático na nuvem após login.
- Sincronização entre dispositivos com a mesma conta local.
- Modo offline com cache local.
- Busca e filtros por categoria.
- Título principal com uma frase filosófica aleatória a cada abertura, incluindo autor.
- Criação, edição, fixação, exclusão e recuperação de notas.
- Exportação de backup JSON.
- Indicador de estado salvo, salvando ou aguardando conexão.
- Mural livre com blocos arrastáveis e posições salvas entre acessos e dispositivos.

## Executar localmente

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

A aplicação fica disponível em `http://localhost:3000`. O ambiente precisa fornecer `DATABASE_URL` e `MANUS_JWT_SECRET` (usado somente para assinar a sessão local). O usuário inicial é provisionado com `WCHOICSS_USERNAME` e `WCHOICSS_PASSWORD` pelo script de seed. Na cópia publicada pelo Manus, a senha fica em configuração protegida e o contêiner executa a migração e o seed antes de iniciar o servidor.

## Estrutura importante

| Caminho | Responsabilidade |
| --- | --- |
| `src/App.tsx` | Login, mural, lixeira, cache, sincronização e backup |
| `server/index.ts` | Servidor Express e API de notas em texto normal |
| `server/auth.ts` | Login local, hash scrypt, sessão HttpOnly e identidade |
| `server/db.ts` | Pool MySQL gerenciado |
| `server/migrate.ts` | Migração idempotente das tabelas |
| `db/migrations/0001_vault_notes.sql` | Schema inicial de usuários e notas |
| `Dockerfile` | Build e publicação em container |
