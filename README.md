# Vistage

App **desktop** de gestão para negócio musical (DJ, produtor, criador de conteúdo). **React 18 + TypeScript + Tauri 2**, banco **SQLite (libsql)** local, com persistência em arquivos **`.vistage`** portáteis. **Local-first** — funciona 100% offline; integrações (Google Calendar, Todoist, Notion, Supabase/celular) são opcionais.

---

## Sumário

- [Filosofia](#filosofia)
- [Arquitetura geral](#arquitetura-geral)
- [Camada `lib/` — função por função](#camada-lib--função-por-função)
- [Módulos (funcionalidades)](#módulos-funcionalidades)
- [Backend Rust + comandos Tauri](#backend-rust--comandos-tauri)
- [Integrações](#integrações)
- [Modelo de dados (SQLite)](#modelo-de-dados-sqlite)
- [Build & desenvolvimento](#build--desenvolvimento)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Princípios de design](#princípios-de-design)

---

## Filosofia

O Vistage funciona como um **editor de documentos**: seus dados vivem num arquivo **`.vistage`** que você **Abre** e **Salva** (`Ctrl/Cmd + S`). O banco local é apenas um *workspace* descartável — a fonte da verdade é sempre o seu arquivo.

- **Um arquivo carrega tudo**: todas as tabelas + os **anexos embutidos** (fotos, flyers, roteiros, manual de marca, PDFs) + os tokens das integrações + a sessão de sincronização. Leve o `.vistage` para outra máquina e abra: está tudo lá.
- **Abre em branco**: a cada início o app começa vazio e você abre seu documento. Isso evita que dados fiquem "presos" no app.
- **Proteção opcional por senha** (AES-GCM 256 + PBKDF2). Sem a senha, não abre — e não há recuperação.

---

## Arquitetura geral

### O modelo de boot "abre em branco" (`src/App.tsx`)

O app **inicia vazio a cada boot**. Os dados não vivem permanentemente no banco local — vivem nos `.vistage`. O banco local (`vistage-replica.db`) é um *workspace* descartável. Orquestração em `App.tsx` (`MainApp`):

1. **Hidrata config + tema.** `useConfigStore.hydrate()` + `useThemeStore.hydrate()`. Sem config válido, cria um padrão silenciosamente em `appDataDir()/vistage` (pasta de anexos + `vistage.config.json`); a tela `<Setup/>` só aparece como fallback.
2. **Abre o banco.** Resolve a réplica em `appDataDir()/vistage-replica.db` — **nunca** numa pasta de nuvem (WAL/mmap não convivem com cloud-sync). `initDatabase()` → comando Rust `db_init` + roda as migrations.
3. **Zeramento (blank wipe).** Pula o wipe se `sessionStorage[SKIP_BLANK_WIPE_KEY]` = "1" (setado por reload pós-abrir/mesclar). **Backup de transição único**: na 1ª vez, se já havia dados, exporta um `.vistage` de segurança antes de zerar (não zera se o export falhar — nada se perde). Senão, `clearDocumentData()`.
4. **Hidrata preferências de view** do documento antes de liberar as páginas (abas, larguras de coluna, filtros), evitando flash de layout.
5. **Libera o banco** e hidrata aparência (tema/accent) do documento.
6. **Escritas automáticas de boot** (em `Promise.allSettled`, não bloqueiam a UI): geração de recorrências, reconciliação financeira, follow-ups de superfãs, tarefas de aniversário, pausa de parcerias, marcadores de tarefas derivadas. Só depois marca `settleBoot()` — senão o app abriria sempre "sujo".
7. **Sync de integrações ao abrir**: se o boot veio de abrir um `.vistage`, dispara `syncAllIntegrations()` em segundo plano (os tokens viajam no arquivo, então abrir já reconecta tudo).

Erros de banco passam por `classifyDbError` → mensagem acionável (not_found / locked / corrupted / permission) com "Tentar de novo" / "Escolher outra pasta".

### O modelo de documento (`document.ts` + `backup.ts`)

`useDocumentStore` (Zustand) gerencia `currentPath`/`currentName`/`dirty`/`bootSettled` e expõe `open` / `save` / `saveAs`. O caminho é lembrado em `localStorage`.

- **Abrir**: `pickBackupFile()` lê (decifrando se preciso). Com dados locais, pergunta **Mesclar / Sobrescrever / Cancelar**. Merge = `INSERT OR IGNORE` linha a linha; Overwrite = `restoreBackup()` (destrutivo). Restaura a sessão Supabase embutida e recarrega preservando os dados.
- **Salvar / Salvar como**: grava via `saveBackupToPath`; sincroniza integrações em segundo plano; avisa se algum anexo não pôde ser lido.

**O contêiner `.vistage`** — três formatos, detectados pela assinatura dos primeiros bytes:

| Formato | Assinatura | Quando | Como é montado |
|---|---|---|---|
| **Contêiner zip** (padrão, sem senha) | `PK\x03\x04` | salvar sem senha | `zipSync` (store) de `vistage.json` (dados, **sem** base64) + `files/<rel>` (bytes crus). Mata o "Out of memory"/"salvamento eterno". |
| **Contêiner cifrado "VENC"** (com senha) | `VENC` | salvar com senha | zipa e cifra o zip inteiro (`encryptBytes`, AES-GCM-256 + PBKDF2, 210k iters; header de 39 bytes). |
| **JSON legado** | `{` | arquivos antigos / backup de transição | `JSON.stringify` com `files` em data URLs base64. |

**O que viaja** (tipo `Backup`): `version`, `exportedAt`, `app`, `tables` (todas as ~70 tabelas em ordem topológica pais→filhos), `files` (anexos), `uploadsDir` (relativiza caminhos entre máquinas) e `session` (Supabase). Por opção do usuário, carrega **todos os segredos** das integrações em texto puro (daí o aviso "não compartilhe" e a opção de senha).

**Restore resiliente**: limpa e reinsere num **único lote atômico**; usa **2 passagens com FKs adiadas** (`DEFERRED_FK`) — colunas FK anuláveis entram NULL e são religadas só se o pai existir (imune a ordem, ciclos gigs↔tasks e órfãos); reescreve caminhos de anexo do `uploadsDir` antigo para o atual (Mac↔Windows). **Leitura de anexos** com timeout de 12s + concorrência 6 + fallback sob o `uploadsDir` atual: um arquivo inacessível não trava o salvar.

### Camada de dados (`db.ts`)

O banco roda **no Rust**, não no webview. `db.ts` é um proxy com a interface do antigo `Database`: `getDb()` (singleton) → `select`/`execute`/`executeBatch`, cada um delegando para um comando Tauri (`db_select`/`db_execute`/`db_execute_batch`). `executeBatch` é o caminho transacional (tudo-ou-nada) de migrations, restore e clear.

### Estado (Zustand) e roteamento

| Store | Arquivo | Papel |
|---|---|---|
| `useConfigStore` | `config.ts` | `uploadsDir` + `vistage.config.json`. |
| `useDocumentStore` | `document.ts` | documento aberto + open/save/saveAs. |
| `useThemeStore` | `theme.ts` | tema/accent/layout (fonte = `document_settings`, viaja no `.vistage`). |
| `useDocPassword` | `docPassword.ts` | senha em memória. |
| `useMobileChanges` | `mobileSync.ts` | capturas do celular a revisar. |

**Roteamento** (`BrowserRouter`): **todas as páginas são lazy** (`React.lazy` + `Suspense`) → chunks separados (ex.: Recharts só carrega no Financeiro). Globais montados no layout: `CommandPalette`, `QuickCapture`, `OpenDocumentDialog`, `PasswordPromptDialog`, `UnsavedCloseGuard`, `MobileChangesDialog`, atalhos e auto-sync do celular.

---

## Camada `lib/` — função por função

Núcleo não-visual do app: banco, documento, criptografia, integrações, helpers.

### `db.ts` — acesso ao SQLite (via Rust)
- `getDb()` → singleton proxy com `select`/`execute`/`executeBatch`.
- `initDatabase(replicaPath)` → abre a réplica e roda as migrations (guard de reentrância).
- `closeDatabase()` → no-op (fechamento é no Rust).
- `classifyDbError(raw)` → traduz erro bruto em `{ kind, ... }` acionável.

### `migrations.ts` — schema versionado
- `runMigrations(db)` → aplica as migrations pendentes (versionadas, **aditivas**, **idempotentes**, atômicas por migration). Versão máxima atual: **v132**. Registra aplicadas em `_migrations`; erros viram `migration_error_v<N>` em `app_settings` sem travar o app.

### `backup.ts` — formato do documento
- `buildBackupData()` → monta o `Backup` (todas as tabelas + sessão, **sem** arquivos).
- `buildBackup()` → `buildBackupData` + anexos em base64 (formato legado).
- `saveBackupToPath(path)` → grava como contêiner (zip sem senha / "VENC" com senha); devolve `{ skipped }`.
- `writeContainer` / `writeEncryptedContainer` → empacotam o zip (cru / cifrado).
- `readContainer(bytes)` → descompacta e reconstrói o `Backup`.
- `readBackupFromPath` / `pickBackupFile` → leem e validam (detectam o formato).
- `restoreBackup(backup)` → **destrutivo**: limpa e reinsere tudo (2 passagens, FKs adiadas, reescrita de caminhos).
- `mergeBackup` (em `document.ts`) → `INSERT OR IGNORE` (preserva existentes).
- `restoreBackupSession` / `restoreBackupFiles` → reconecta sync e restaura anexos.
- `clearDocumentData()` / `hasAnyDocumentData()` → zera / detecta dados (preserva tabelas de máquina).
- `parseBackupRaw(raw)` → valida e converte o texto bruto.

### `crypto.ts` — criptografia opcional
- `encryptString` / `decryptString` → envelope JSON (formato legado).
- `encryptBytes` / `decryptBytes` → envelope **binário "VENC"** (contêiner cifrado).
- `isEncryptedRaw` / `isEncryptedContainer` → detecção de formato.

### `document.ts` — store do documento
- `useDocumentStore` → `open` / `save` / `saveAs`, `dirty`, `bootSettled`.
- `displayDocName(name)` → nome sem a extensão.
- `reloadKeepingData()` → recarrega sem disparar o "abre em branco".
- `registerOpenModeOpener` / `OpenMode` → diálogo Mesclar/Sobrescrever/Cancelar.

### `config.ts` — pasta de anexos
- `useConfigStore` → `hydrate` / `setupNew(folder)` / `loadExisting` / `patchConfig` (lê/grava `vistage.config.json`).

### `uploads.ts` — anexos e mídia
- `saveAttachment(src, subdir)` → copia o arquivo para `uploadsDir/<subdir>` e devolve o caminho.
- `useImageUrl(path)` → hook que devolve a URL da mídia: **streaming nativo** (`asset://`, sem base64 na memória) com **fallback auto-curável** pra base64; resolve o caminho real (cobre `.vistage` de outra máquina); vídeo nunca vai pra base64.
- `pickFile` / `deleteAttachment` / `openAttachment` → diálogo nativo / remover / abrir no app do SO.
- `IMAGE_EXTS` / `VIDEO_EXTS` / `DOC_EXTS`.

### `format.ts` — datas e moeda (pt-BR)
- `formatDate` / `formatCurrency` / `formatRating`.
- `toLocalISODate` / `toLocalYearMonth` / `todayISO` → datas no fuso **LOCAL** (não UTC — evita "hoje" pular um dia à noite no Brasil).

### `search.ts` — busca global
- `globalSearch(query, limit)` → busca em ~12 entidades (GIGs, contatos, tarefas, tracks, festas, venues, fãs, alunos, ideias…), com rótulos em `KIND_LABEL`.

### `csv.ts` — exportação/importação
- `exportEntityCsv` / `exportTransactionsCsv` / `exportAllCsv` → CSV por entidade.
- `pickAndParseCsv` / `importCsvIntoTable(mode)` → importação (append/replace).

### `report.ts` — relatório mensal
- `loadMonthlyReport(month)` → KPIs do mês. `buildReportCsv` / `monthOptions` / `quarterOfMonth`.

### `theme.ts` — aparência
- `useThemeStore` → tema (light/dark), accent (6 cores), layout do menu; fonte = `document_settings`.
- `applyAccent` / `ACCENTS` / `persistAppearanceToDocument`.

### `nav.ts` — navegação
- `DEFAULT_NAV` / `NAV_GROUP_ORDER` / `NAV_GROUP_META` → itens e grupos (Criação/Relacionamento/Produtividade/Gestão).
- `loadOrderedNav` / `saveNavOrder` / `saveItemGroups` / `loadGroupLabels` / `saveGroupLabels` → ordem, grupos e rótulos customizáveis (persistidos).

### `shortcuts.ts` — atalhos
- `useShortcutsConfig` / `setShortcutKey` / `resetShortcuts` / `matchShortcut` → atalhos customizáveis (search/newItem/quickCapture).
- `triggerNewItem` / `triggerQuickCapture` / `requestNewItemAt` → barramento de eventos.

### `events.ts` / `dirty.ts` / `moduleView.ts` / `docSettings.ts` / `utils.ts`
- `DATA_CHANGED` + `emitDataChanged()` → barramento "dados mudaram" (recarrega painéis).
- `useUnsavedConfirm(isDirty)` → guarda de alterações não salvas.
- `useModuleView()` → estado de view (aba/lista/cards) por módulo, persistido no documento.
- `persistDocSetting` / `hydrateViewPrefsFromDocument` / `persistViewPrefsToDocument` → preferências de view dentro do `.vistage`.
- `cn(...)` → merge de classes Tailwind.

### `docPassword.ts` / `passwordPrompt.ts`
- `useDocPassword` / `getDocPassword` / `setDocPassword` → senha do documento em memória.
- `promptPassword(opts)` / `registerPasswordPrompt` → diálogo de senha imperativo.

### `notify.ts` — notificações
- `useAlertNotifications()` → dispara notificações do SO para alertas.
- `checkNotificationPermission` / `enableNotifications` / `restoreNotificationPreference` / `sendTestNotification`.

### `seed.ts` — dados de exemplo
- `isDatabaseEmpty()` / `seedExampleData()` → popular com GIGs/contatos/tarefas/transações de demo.

### Integrações (clientes)
- **`gcal.ts`** — `connect` / `disconnect` / `getValidAccessToken` (auto-refresh) / `listCalendars` / `syncAll` / `pushGigToCalendar` / `pushClassToCalendar` / `pushPartyToCalendar` / `pushOkrToCalendar` / `loadModuleCalendarIds`. (detalhes abaixo)
- **`todoist.ts`** — `syncTodoist` (bidirecional) / `saveTodoistConfig` / `listTodoistProjects` / `tombstoneTodoistTask` / `unlinkAllTodoist`.
- **`notion.ts`** — `syncNotion` (ideias→Notion) / `createIdeasDatabase` / `validateNotionToken` / `listNotionPages`.
- **`supabase.ts`** — `signIn`/`signOut`/`currentUser` + `getPortableSession`/`restorePortableSession` (sessão que viaja no `.vistage`).
- **`mobileSync.ts`** — `pushMirror` (espelho mínimo p/ o celular) / `fetchPendingCaptures` / `ingestCaptures` / `discardCaptures` / `recoverCaptures` / `deleteCaptures` / `startAutoSync` (Realtime).
- **`integrationsSync.ts`** — `syncAllIntegrations({ silent? })` → orquestra as quatro, cada uma em try/catch, com guard de reentrância.

---

## Módulos (funcionalidades)

Um diretório por módulo em `src/modules/`, cada um tipicamente com `api.ts` (dados) + `*Page.tsx` + `forms/` + `views/` + `components/`.

| Módulo | Rota | O que faz | Tabelas |
|---|---|---|---|
| **Dashboard** | `/` | Abas: **Visão geral** (KPIs, cards GIGs/Música/Conteúdo/Festas, timeline semanal, finanças, OKRs), **Linha do tempo**, **Mapa mental**, **Metodologias**, **Carreira em números**. Sub-painéis `/relacionamento` `/criacao` `/gestao`, foco do dia `/hoje`, `/mapa`. | (lê várias) |
| **Alertas** | `/alertas` | Regras de alerta/insight em editor **SE / ENTÃO** (E/OU, "desaparecer ao clicar"), seguras por whitelist + valores bindados. | `custom_rules` |
| **GIGs** | `/gigs` | CRUD + 4 views (lista/calendário/kanban/insights); debrief com avaliação; checklist de preparação; setlist N:N com tracks; presença de fãs; push pro Calendar. | `gigs`, `gig_debrief_drafts`, `gig_setlists`, `gig_tracks`, `gig_fans` |
| **Venues** | `/venues` | CRUD; foto; capacidade, conceito, rider técnico; coordenadas + mapa (Leaflet); DJs residentes; KPIs por casa. | `venues` |
| **Pessoas** | `/pessoas` | CRM unificado (contatos + fornecedores); múltiplos tipos de relação; histórico de interações; aniversários; vínculo a GIGs/tarefas. (`/crm` e `/fornecedores` redirecionam aqui) | `contacts`, `contact_interactions`, `suppliers`, `supplier_services` |
| **Clube de fãs** | `/fas` | Níveis (Possível→Superfã), embaixadores; interações; grupos (WhatsApp); listas por GIG; perks/VIP. | `fans`, `fan_interactions`, `fan_groups`, `fan_lists`, `fan_perks` |
| **Produção Musical** | `/musica` | **Stage-Gate** (etapas + gates); projetos e tracks; Flow Sessions; colaboradores; metas de mídia; snapshots de performance; custos; sub-blocos Marketing/Financeiro/Performance. | `music_projects`, `tracks`, `track_*`, `music_project_costs` |
| **Aulas** | `/aulas` | Alunos (vínculo a CRM); pacotes com ementa; sessões com controle de saldo; push pro Calendar. | `students`, `class_packages`, `student_packages`, `classes` |
| **Festas** | `/festas` | Produção de eventos próprios: lineup N:N, orçamento (orçado×real), custos, lotes/tickets, estágios, tarefas, candidatos a venue; auto-tarefas ao confirmar. | `parties`, `party_*` |
| **Conteúdo** | `/conteudo` | Pipeline editorial (lista/calendário/kanban); roteiro por cena; métricas com snapshots; promove GIG/festa/track. | `content`, `content_scenes`, `content_snapshots` |
| **Banco de Ideias** | `/ideias` | Captura rápida `Ctrl+I`; Brain Dump; calor/maturação; conversão para Track/Tarefa; provocações (InsightDie); sync Notion. | `ideas`, `manual_insights`, `dismissed_insights` |
| **Insights** | `/insights` | Pool unificada `v_insights` (aprendizados de GIGs + bloqueios de tracks + notas de festas + ideias); busca full-text; exportar TXT. | (view `v_insights`) |
| **Energia & Foco** | `/foco` | 3 abas: **Trilha da Semana** (blocos de foco por dia), **Modo Foco** (sessões, streak, hora de pico), **Highlights**. Widget no header + janela-overlay de sessão. | `work_sessions`, `focus_blocks`, `highlights` |
| **OKRs** | `/objetivos` | Objetivos trimestrais com key results; 5 fontes de auto-pull (GIGs/tracks/festas/conteúdos/receita); Decision Log. | `okrs`, `okr_kr_tasks`, `decisions` |
| **Identidade Artística** | `/identidade` | Bio, paleta de cores, fontes da marca, logo/isótipo/presskit/manual; galeria de fotos; templates de arte. | `artist_identity`, `artist_templates` |
| **Tarefas** | `/tarefas` | Lista + Kanban + **Eisenhower** (drag-and-drop); subtarefas; prioridade/energia; recorrência; sync Todoist; tarefas derivadas de outras entidades; vínculos polimórficos. | `tasks`, `subtasks`, `task_links`, `todoist_tombstones` |
| **Reuniões** | `/reunioes` | Reuniões que viram tarefas-lembrete, vinculadas a contatos. | `meetings` |
| **Financeiro** | `/financeiro` | Dashboard (Recharts); transações (vínculos a gig/track/aula/festa); recorrentes; categorias; patrimônio derivado de equipamentos; import de royalties. | `finance_categories`, `finance_transactions`, `finance_recurring`, `equipment` |
| **Carreira (Wrapped)** | `/carreira` | "Carreira em números" — retrospectiva (GIGs/lançamentos/festas/conteúdos), pensada pra press kit. | (lê várias) |
| **Configurações** | `/configuracoes` | Documento (senha), integrações, aparência (tema/accent/menu), atalhos, regras de alerta, mapa mental, exportações CSV/JSON, dados de exemplo. | `app_settings`, `document_settings` |

---

## Backend Rust + comandos Tauri

Crate `musicgest_lib` (edition 2021). `lib.rs` registra plugins, mantém estado (`DbState`, `GcalState`) e expõe os comandos.

### Banco (`db.rs` — libsql local)
| Comando | O que faz |
|---|---|
| `db_init(replica_path)` | abre/cria o arquivo libsql, liga `PRAGMA foreign_keys=ON`, mantém conexão viva em `DbState`. |
| `db_select(sql, params)` | query → `Vec<Map<String,Value>>` (Blob → base64). |
| `db_execute(sql, params)` | statement → `{ rowsAffected, lastInsertId }`. |
| `db_execute_batch(stmts)` | **transação única** `BEGIN`→…→`COMMIT` (ROLLBACK em erro). |

### Google Calendar (`gcal.rs` — OAuth PKCE, Installed App)
| Comando | O que faz |
|---|---|
| `gcal_start_oauth(client_id, scopes)` | sobe servidor loopback `127.0.0.1:0`, gera `code_verifier`/`code_challenge` (S256) + `state`, monta a URL de autorização. |
| `gcal_wait_callback(port, timeout)` | espera o redirect, **valida o `state`** (anti-CSRF), responde com `oauth_success.html`. |
| `gcal_exchange_code(...)` / `gcal_refresh_token(...)` | troca o code por tokens / renova o access_token. |
| `gcal_list_calendars` / `gcal_create_event` / `gcal_update_event` (PUT) / `gcal_delete_event` / `gcal_list_events` | API do Calendar (HTTP via `ureq`, evita CORS). |

> O fluxo é **loopback-localhost** (sem redirect público). `client_id`/`client_secret` são do usuário (Google Cloud Console).

### Config & permissões
- **Plugins**: dialog, fs, shell, notification, http. Libs: `libsql`, `tokio`, `ureq`, `tiny_http`, `sha2`/`base64`/`rand` (PKCE). `macos-private-api` (vibrância).
- **`tauri.conf.json`**: `Vistage` / `com.vistage.app`; janela 1280×800; **asset protocol** habilitado (escopo `**`, p/ exibir anexos de qualquer caminho); `csp: null`; associação de arquivo **`.vistage`**; macOS ad-hoc sign.
- **`capabilities/default.json`**: janelas `main` + `work-session`; **`fs:scope` amplo (`**`)**; **`http`** restrito a `api.todoist.com` e `api.notion.com`.

---

## Integrações

Tokens vivem em `app_settings` (ou `gcal_auth`) e **viajam no `.vistage`**. `integrationsSync.ts` orquestra, chamado **ao abrir** e **a cada salvar** (silencioso).

- **Google Calendar** — PKCE OAuth. **Push unidirecional** (Vistage→Google) de **gigs, aulas, festas, OKRs** (cada um com calendário próprio opcional). Tokens em `gcal_auth`; refresh automático com 60s de margem. Cada entidade guarda seu `gcal_event_id`.
- **Todoist** — token + projeto. **Bidirecional** `tasks`↔Todoist (via plugin HTTP do Tauri, p/ CORS): propaga exclusões via **tombstones**, importa novas, espelha conclusões nos dois sentidos, empurra locais, atualiza mudadas. Mapeia prioridades 1-4.
- **Notion** — token de integração. **Unidirecional** (só ideias): cria o database "💡 Ideias — Vistage" e empurra cada ideia (vínculo via `notion_page_id`).
- **Supabase / celular** — chave publishable pública + RLS (cada DJ na própria conta). **Privacidade**: finanças detalhadas nunca sobem, só o agregado. **PUSH**: espelhos de leitura (agenda, saldo, contato-do-dia, foco, tarefas, catálogo). **PULL**: o celular insere em `capture_inbox`; o desktop **revisa** (Fundir/Descartar via `MobileChangesDialog`) — nunca aplica sozinho. Auto-sync ao abrir + a cada 3 min + Realtime.

---

## Modelo de dados (SQLite)

Migrations versionadas (`migrations.ts`), **aditivas, idempotentes**, atômicas por migration (até **v132**). Tabela de controle `_migrations`. A migration **v90** é um "reparo de schema" que re-emite os `ADD COLUMN` históricos.

Tabelas por domínio:

- **GIGs**: `gigs` (+ `gig_debrief_drafts`, `gig_setlists`, `gig_tracks`, `gig_fans`).
- **Música**: `music_projects`, `tracks` (+ `track_collaborators`, `track_media_targets`, `track_flow_sessions`, `track_performance_snapshots`, `music_project_costs`).
- **Pessoas/CRM**: `contacts` (+ `contact_interactions`), `venues`, `suppliers` (+ `supplier_services`).
- **Fãs**: `fans` (+ `fan_interactions`, `fan_groups`/`fan_group_members`, `fan_lists`/`fan_list_members`, `fan_perks`).
- **Aulas**: `students`, `class_packages`, `student_packages`, `classes`.
- **Festas**: `parties` (+ `party_stages`, `party_budget_items`, `party_costs`, `party_tickets`, `party_tasks`, `party_venue_candidates`).
- **Conteúdo**: `content` (+ `content_scenes`, `content_snapshots`).
- **Financeiro**: `finance_categories`, `finance_transactions`, `finance_recurring`, `equipment`.
- **Tarefas/Reuniões**: `tasks` (+ `subtasks`, `task_links`, `todoist_tombstones`), `meetings`.
- **Foco/Energia**: `work_sessions`, `focus_blocks`.
- **OKRs/Estratégia**: `okrs`, `okr_kr_tasks`, `decisions`, `highlights`.
- **Ideias/Insights**: `ideas`, `manual_insights`, `dismissed_insights`, `custom_rules`, view `v_insights`.
- **Identidade**: `artist_identity`, `artist_templates`, `recurring_fests`.
- **Sistema**: `app_settings`, `gcal_auth`, `document_settings`, `_migrations`.

FKs usam `ON DELETE CASCADE` (filhos) ou `SET NULL` (vínculos cruzados); junções N:N têm PK composta; ciclos (gigs↔tasks) são resolvidos no restore pelas FKs adiadas. `app_settings` e `gcal_auth` (`MACHINE_TABLES`) sobrevivem ao wipe de boot, mas ainda viajam no `.vistage`.

---

## Build & desenvolvimento

### Pré-requisitos
- **Node** ≥18 (20 no CI), npm.
- **Rust** estável — <https://rustup.rs>.
- Toolchain nativo: macOS `xcode-select --install`; Windows MS C++ Build Tools + WebView2.

```bash
npm install
```

### Scripts
| Script | Ação |
|---|---|
| `npm run dev` | Vite dev server (porta 1420). |
| `npm run build` | `tsc --noEmit && vite build` (typecheck + bundle). |
| `npm run tauri:dev` | App desktop em dev. |
| `npm run tauri:build` | Produção + instaladores. |

Stack: React 18.3, React Router 6, Zustand 5, Radix + Tailwind (shadcn-style), Recharts, Leaflet, date-fns, **fflate** (zip do `.vistage`), jspdf, sonner, lucide-react. TypeScript 5.6, Vite 5.

### CI (GitHub Actions)
- **`build.yml`**: push em `main`/`claude/**` ou manual → matriz **macos-latest + windows-latest**; `npm ci` → `npm run tauri:build` (retry até 3× pra downloads transitórios do WiX/NSIS); artefatos `.dmg`/`.msi`/`.exe` (retenção 14 dias).
- **`deploy-pwa.yml`**: push tocando `mobile/**` → builda o companion mobile (PWA) e publica no GitHub Pages.

### Instaladores
- **macOS** `.dmg` (assinatura ad-hoc; 1ª abertura: clique direito → Abrir).
- **Windows** `.msi` (WiX) + `.exe` (NSIS) (SmartScreen → "Executar mesmo assim").
- Duplo-clique num `.vistage` abre no app (associação de arquivo registrada).

---

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl/Cmd + S` | Salvar o documento |
| `Ctrl/Cmd + K` | Busca global |
| `Ctrl/Cmd + N` | Novo item no módulo ativo |
| `Ctrl + I` | Captura rápida de ideia |
| `Ctrl + Shift + F` | Modo Foco Profundo (oculta o menu) |

Customizáveis em **Configurações → Atalhos**.

---

## Princípios de design

Referenciais com base empírica, não modismos de produtividade:

- **Stage-Gate** (Cooper, 1986) — pipeline de inovação com gates decisórios.
- **Constraint-based Creativity** (Stokes) — restrições aumentam produção criativa.
- **Flow Theory** (Csikszentmihalyi) — equilíbrio desafio × habilidade.
- **After-Action Review** (US Army) — debrief estruturado pós-evento.
- **Energy Management** (Schwartz & McCarthy, HBR 2007) — gerenciar energia, não só tempo.
- **Progress Principle** (Amabile, HBS) — visualizar progresso prediz motivação.
- **OKRs** (Grove / Doerr) — objetivos com key results mensuráveis.
- **Decision Log** (Kahneman) — explicitar critérios reduz vieses.
- **Lei de Goodhart** — métricas são bússolas, não termômetros.
