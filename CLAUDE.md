# CLAUDE.md — Convenções de trabalho no Vistage

## O que é
Vistage: app desktop **local-first** de gestão de carreira musical (Tauri 2 + React 18 + TypeScript + SQLite), todo em PT-BR, banco guardado em HD externo escolhido pelo usuário. Companion mobile de captura via relay Supabase. Usuário final: um DJ-produtor (Matheus), não desenvolvedor — pedidos chegam em linguagem de UX/feature, não de código.

Leia antes de codar: `STATE.md` (estado do projeto), `UI_GUIDELINES.md` (regras de UI — **obrigatórias**), `AUDITORIA.md`.
⚠️ `STATE.md` ainda se apresenta como "MusicGest"; o nome atual é **Vistage** — atualizar na próxima passada.

## Comandos
- `npm run dev` · `npm run tauri:dev` — desenvolvimento
- `npm run build` — roda `tsc --noEmit && vite build`; **precisa terminar limpo antes de fechar qualquer batch**
- `npm test` — Vitest (`vitest run`); `npm run test:watch` pro modo contínuo
- `npm run tauri:build` — build desktop

## Fluxo de execução
1. Antes de cada batch: apresentar o que muda (schema, arquivos afetados) e **pedir confirmação**.
2. **Estenda o existente; não recrie.** Procure o padrão já usado (hooks, forms, componentes) antes de inventar outro.
3. Ambiguidade no pedido → marcar **[CONFIRMAR]** no plano/PR; nunca decidir silenciosamente.
4. Um commit por batch/módulo, mensagem no padrão `Batch X: ...`.
5. Ao fechar: `tsc` + build limpos, teste manual do fluxo crítico e **STATE.md atualizado**.

## Migrations e dados (zona crítica)
- Migrations vivem em `src/lib/migrations.ts`, versionadas e **aditivas** (versão mais alta neste clone: **v186** — confira sempre em `_migrations`). Nunca editar migration antiga: criar nova. Reversível quando viável; jamais quebrar dados existentes.
- **Toda tabela nova** deve ser registrada em `buildBackupData`/`restoreBackup` (`src/lib/backup.ts`), na limpeza de documento (`src/lib/document.ts`) e no export CSV. Tabela fora do backup = perda **silenciosa** de dados = 🔴 crítico.
- Vínculos automáticos entre módulos são **idempotentes** (IDs em colunas como `task_id`, `content_ids[]`).

## UI
A autoridade é o `UI_GUIDELINES.md` — obedecer integralmente. Destaques: explicações só atrás de "?"; **nenhum modal perde alteração** (`useUnsavedConfirm` em todo Dialog com formulário); fonte única de verdade (dinheiro vive no Financeiro; o resto é read-through); campos de texto longo em auto-grow; exclusões seguem a política desfazer vs. confirmar; busca global e sidebar atualizadas ao criar entidades novas; lazy-load de páginas novas.

## Testes (`npm test`)
Cobertura **deliberadamente estreita**: só a zona crítica (migrations, backup, restore). Não é meta cobrir o app.

**Stack:** Vitest + **better-sqlite3**. Roda em Node, fora do Tauri. O `node:sqlite` nativo não serve porque o CI está pinado em Node 20 e ele só existe no 22+.

**Como funciona:** mocka-se **uma** fronteira, o `invoke` do `@tauri-apps/api/core` (`src/test/sqliteDb.ts`), que despacha `db_select`/`db_execute`/`db_execute_batch` pro SQLite em memória. Tudo acima dela é o código de produção — `getDb()`, `runMigrations` com o pré-filtro de ALTER e o lote atômico, `buildBackupData`, `restoreBackup`. Testar uma cópia da lógica não provaria nada.

- `src/test/sqliteDb.ts` — adaptador. Converte os placeholders `$N` pros `?` posicionais **preservando reuso de índice** (o app faz `SET value = $2` e `($3 IS NULL OR id <> $3)`).
- `src/test/fixture.ts` — banco no schema do `BASELINE_VERSION` com registros de Patrimônio, Financeiro e GIGs. **Ao adicionar migration, não mexa no BASELINE_VERSION**: ele tem que seguir apontando pro schema anterior, senão o teste de migração deixa de exercitar a subida.
- `src/lib/migrations.test.ts` — sobe do baseline sem perder linha nem valor de Patrimônio; idempotência; sem versão duplicada ou fora de ordem; todo `ADD COLUMN NOT NULL` com `DEFAULT`.
- `src/lib/backup.test.ts` — round-trip **para um banco NOVO** (o caso de abrir o `.vistage` em outra máquina). Reabrir no mesmo banco não prova nada: `restoreBackup` só limpa e reinsere as tabelas presentes no backup, então uma tabela esquecida no array `TABLES` ficaria intocada e a comparação passaria. Verificado por mutação: comentar `"equipment"` em `TABLES` quebra o teste.

`runMigrations(db, { upTo })` existe só pros testes montarem o schema anterior; o app nunca passa `upTo`.

## Segurança
O repositório é **público**: nunca commitar segredos, chaves ou tokens (nem deixar no histórico). Tokens OAuth (Google/Todoist/Notion) sempre criptografados e nunca logados. Mudanças em CSP ou escopo de filesystem: **propor, não aplicar** sem confirmação.

## Preferências do dono
Objetividade; não errar; embasamento com evidência (científica quando aplicável) acima do "padrão mais comum em apps similares".
