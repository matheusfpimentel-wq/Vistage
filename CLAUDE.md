# CLAUDE.md — Convenções de trabalho no Vistage

## O que é
Vistage: app desktop **local-first** de gestão de carreira musical (Tauri 2 + React 18 + TypeScript + SQLite), todo em PT-BR, banco guardado em HD externo escolhido pelo usuário. Companion mobile de captura via relay Supabase. Usuário final: um DJ-produtor (Matheus), não desenvolvedor — pedidos chegam em linguagem de UX/feature, não de código.

Leia antes de codar: `STATE.md` (estado do projeto), `UI_GUIDELINES.md` (regras de UI — **obrigatórias**), `AUDITORIA.md`.
⚠️ `STATE.md` ainda se apresenta como "MusicGest"; o nome atual é **Vistage** — atualizar na próxima passada.

## Comandos
- `npm run dev` · `npm run tauri:dev` — desenvolvimento
- `npm run build` — roda `tsc --noEmit && vite build`; **precisa terminar limpo antes de fechar qualquer batch**
- `npm run tauri:build` — build desktop

## Fluxo de execução
1. Antes de cada batch: apresentar o que muda (schema, arquivos afetados) e **pedir confirmação**.
2. **Estenda o existente; não recrie.** Procure o padrão já usado (hooks, forms, componentes) antes de inventar outro.
3. Ambiguidade no pedido → marcar **[CONFIRMAR]** no plano/PR; nunca decidir silenciosamente.
4. Um commit por batch/módulo, mensagem no padrão `Batch X: ...`.
5. Ao fechar: `tsc` + build limpos, teste manual do fluxo crítico e **STATE.md atualizado**.

## Migrations e dados (zona crítica)
- Migrations vivem em `src/lib/migrations.ts`, versionadas e **aditivas** (versão mais alta neste clone: **v181** — confira sempre em `_migrations`). Nunca editar migration antiga: criar nova. Reversível quando viável; jamais quebrar dados existentes.
- **Toda tabela nova** deve ser registrada em `buildBackupData`/`restoreBackup` (`src/lib/backup.ts`), na limpeza de documento (`src/lib/document.ts`) e no export CSV. Tabela fora do backup = perda **silenciosa** de dados = 🔴 crítico.
- Vínculos automáticos entre módulos são **idempotentes** (IDs em colunas como `task_id`, `content_ids[]`).

## UI
A autoridade é o `UI_GUIDELINES.md` — obedecer integralmente. Destaques: explicações só atrás de "?"; **nenhum modal perde alteração** (`useUnsavedConfirm` em todo Dialog com formulário); fonte única de verdade (dinheiro vive no Financeiro; o resto é read-through); campos de texto longo em auto-grow; exclusões seguem a política desfazer vs. confirmar; busca global e sidebar atualizadas ao criar entidades novas; lazy-load de páginas novas.

## Testes (dívida assumida — prioridade ao tocar nesta área)
Hoje **não há testes nem vitest** no projeto. Ao mexer em backup, restore ou migrations, criar antes de alterar:
1. **Round-trip:** popular fixture → `buildBackupData` → `restoreBackup` → todas as tabelas batem linha a linha (FKs religadas, caminhos reescritos).
2. **Migração:** aplicar v1→atual em banco vazio **e** em banco populado com schema antigo; nenhuma linha perdida e `_migrations` fechando consistente.
Stack sugerida: Vitest (o projeto já é Vite) + `cargo test` no `src-tauri`.

## Segurança
O repositório é **público**: nunca commitar segredos, chaves ou tokens (nem deixar no histórico). Tokens OAuth (Google/Todoist/Notion) sempre criptografados e nunca logados. Mudanças em CSP ou escopo de filesystem: **propor, não aplicar** sem confirmação.

## Preferências do dono
Objetividade; não errar; embasamento com evidência (científica quando aplicável) acima do "padrão mais comum em apps similares".
