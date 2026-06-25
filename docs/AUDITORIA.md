# Auditoria completa — Vistage

Varredura exaustiva em 4 frentes (segurança · SQL/dados · performance · bugs/hooks/limpeza), cruzada com o schema (`migrations.ts` v132). Cada item tem `arquivo:linha` + severidade + correção. **Status:** ✅ corrigido · ⬜ pendente · 🟦 decisão sua.

> Resumo: o código é **disciplinado** — sem SQL injection explorável, sem injeção de HTML/`eval`, sem telemetria, sem vazamento de segredo em logs. Os pontos reais se concentram em (1) alguns bugs de dados/data já corrigidos, (2) decisões de segurança de design (token em texto, escopos amplos, CSP), e (3) performance em listas grandes e no boot.

---

## ✅ Já corrigido (PR #99)

**Lote inicial:** `fans/api.ts` (painel "GIGs do fã" vazio — colunas inexistentes) · datas UTC em `mobileSync`/`foco` · painéis de grupo sem `.catch` · galeria em base64 → streaming nativo · MindMap O(E·N) → Map.

**Lote auditoria 1:** `NotificationBell` `superfan`→`level='Superfã'` (matava 6 alertas) · `backup.ts` 3 colunas fantasma · `JSON.parse` guardado em setlist/OKRs · `insights` `.catch` · OKR receita `status='Recebido'` · Leaflet destruído no unmount · cronômetro do Modo Foco memoizado · código morto (`writeBackupFile`/`encryptString`) · MIME `.avi`/`.mkv`.

---

## ⬜ Bugs pendentes (claros, seguros de corrigir)

### Datas em UTC (mesma classe já corrigida noutros pontos → usar `toLocalISODate`/`toLocalYearMonth`)
- ⬜ **[Alta]** `finance/api.ts:760` `autoGenerateRecurringUpToNow` usa `toISOString().slice(0,7)` — pode **gerar recorrências um mês cedo** à noite (BR) e grava `last_recurring_gen`.
- ⬜ **[Alta]** `finance/api.ts:916,919,923` `periodToDateFilter` (UTC) — totais do dashboard financeiro no período errado perto da virada.
- ⬜ **[Alta]** `dashboard/DashboardPage.tsx:141-150` `nextNDays` mistura data UTC com getters locais → timeline de 7 dias começa um dia cedo / `isToday` não casa.
- ⬜ **[Alta]** `gigs/forms/DebriefForm.tsx:207` data-only parseada como UTC → **dia errado gravado** no título da Ideia auto-criada. Usar `formatDate(gig.date,"dd/MM")`.
- ⬜ **[Méd]** `music/api.ts:804` data da task de lançamento (UTC). · `gigs/api.ts:227,384,647` due dates de debrief/prep (frágil). · `fans/api.ts:742`, `DebriefForm.tsx:261` "hoje" via UTC.

### `JSON.parse`/`parseInt`/`parseFloat` sem guarda
- ⬜ **[Méd]** `parties/components/WorkflowTab.tsx:248` `JSON.parse` sem `Array.isArray` → `.includes` num não-array quebra a etapa (irmãos em `:491`/`:609` já guardam).
- ⬜ **[Méd]** `parties/components/OrcamentoTab.tsx:79` `parseFloat` sem guarda → `NaN` em `actual_amount` (campo "projetado" já é guardado).
- ⬜ **[Méd]** `parties/components/IngressosTab.tsx:60` `parseInt` sem radix/guarda → `NaN` em `quantity_total`.
- ⬜ **[Baixa]** `finance/api.ts:319,1242` `cache_amount ?? 0` mas `* pct` pode dar `NaN`. · `music/api.ts:599` `daysInStage` NaN se `entered_at` inválido.

### `Promise.all` sem `.catch` → spinner preso + unhandled rejection
- ⬜ **[Méd]** `DashboardPage.tsx:172-190` (try/finally sem catch) · `TodayPage.tsx:96-105` · `MetodologiasPage.tsx:98-103` · `revisao/actionItems.ts:38-46,50-55`. Copiar o padrão do `useAsync` de `GroupDashboards`.

### Semântica SQL
- ⬜ **[Méd]** `finance/api.ts` `topGigs` (~`:1027`) e `loadProjectProfit` (gig branch) — `JOIN gigs` é INNER → receita de GIG apagada some. Usar `LEFT JOIN` + `COALESCE`.
- ⬜ **[Méd]** `report.ts:48-53` "concluídas" inclui `'Confirmada'` (futuras) na contagem e no `SUM(cache)`. (Obs.: a aba "Relatório mensal" foi removida do dash, mas a rota/componente seguem.)
- ⬜ **[Méd]** `classes/api.ts:178-179,455-462` usa só `class_packages.total_hours` (template), ignora `student_packages.total_hours` (instância) → `COALESCE`. E `:491` vs `:495` denominador da taxa inclui `Cancelada`/`Falta`.
- ⬜ **[Méd]** `mobileSync.ts:124-128` `to_receive` soma todas as datas, enquanto income/expense são do mês — checar intenção.
- ⬜ **[Baixa]** `gigs/api.ts:533` bucket fantasma `'A Caminho'` · `:550` `g.date.slice` assume não-nulo · `report.ts:63` título de track só `title_working`.

### Hooks (vazamento/limpeza)
- ⬜ **[Méd]** `UnsavedCloseGuard.tsx:42-56` `onCloseRequested` unlisten vaza em unmount rápido (flag `cancelled`). · `NotificationBell.tsx:255-277` dois effects fazem o mesmo CRM-alert (corrida + trabalho dobrado). · `venues/forms/VenueForm.tsx:160-179` debounce Nominatim sem cleanup de unmount. · `revisao/AlertsPage.tsx:23-52` `setAlerts` após unmount.
- ⬜ **[Baixa]** `setState` pós-await sem flag em vários loads (`FocoPage`, `MobileTabBar`, `Sidebar`, `FileMenu`, `WeekTrack`) — benigno no React 18; padrão de referência: `CareerTimelinePage`.

---

## 🟦 Segurança — decisões de design (recomendo, mas mexem em comportamento/UX)

> Não há SQLi nem injeção de HTML. O que segue é **superfície/risco**, não bug ativo.

- 🟦 **[Alta]** **Tokens em texto + `.vistage` feito pra compartilhar, com criptografia opcional/desligada** (`backup.ts`, `db.rs`). Um arquivo compartilhado/vazado entrega credenciais Google/Todoist/Notion/Supabase vivas. **Recomendo:** forçar/ligar por padrão a senha quando houver tokens; ou guardar tokens no keychain do SO; e um modo "exportar sem credenciais".
- 🟦 **[Alta]** **`fs:scope = "**"`** (`capabilities/default.json`) — qualquer foothold no webview lê/apaga qualquer arquivo. **Recomendo:** restringir a AppData + adicionar o `uploadsDir` em runtime via scope API.
- 🟦 **[Alta]** **`csp: null`** (`tauri.conf.json`) — sem segunda linha de defesa (multiplica os dois acima). **Recomendo:** CSP estrito (`script-src 'self'`, `img-src/media-src 'self' asset: data:`, `connect-src` nos hosts reais). Testar com recharts/leaflet (precisam `style-src 'unsafe-inline'`).
- 🟦 **[Méd]** **`assetProtocol.scope = "**"`** — restringir a uploads/AppData + runtime.
- 🟦 **[Méd]** **Escopo do Google Calendar amplo** (`gcal.ts:5` `auth/calendar`) → minimizar para `calendar.events` + `calendar.calendarlist.readonly` (Drive já é mínimo `drive.file`). *Obs.: exige reconsentir.*
- 🟦 **[Méd]** **Espelho mobile**: `mobileSync.ts:290-297` sobe `cache_amount` por GIG e `:132-154,326-344` toda a agenda de contatos (nome/telefone/email ×2000) pra nuvem, apesar do "só resumo". Tirar/optar-in + documentar.
- 🟦 **[Méd]** **RLS é o único controle** no Supabase — verificar que está habilitado com política por usuário nas 8 tabelas de espelho/inbox (posso checar via tooling do Supabase se quiser).
- ⬜ **[Baixa, seguro]** `document.ts mergeBackup` — gatear nomes de tabela na allowlist fixa `TABLES` (hoje vêm do JSON do arquivo aberto; não explorável, mas hardening). · validar `state` do OAuth também no front. · truncar corpo de erro de Todoist/Notion em toasts.

---

## ⬜ Performance — maiores alavancas

- ⬜ **[Alta]** `tasks/components/PendingTasksBadge.tsx:24-37` roda um `COUNT` com JOIN **por linha**, no mount **e a cada `DATA_CHANGED`** (música/aulas/fãs/venues/festas). 300 linhas = 300 queries a cada salvamento em qualquer lugar. **Fix:** batelada única `... WHERE entity_id IN (...) GROUP BY entity_id` no pai; badge vira puro.
- ⬜ **[Alta]** `App.tsx:234-248` boot roda `retroactiveSyncAllLinked` (N+1 sobre todas GIGs/aulas/festas/custos — ~1k+ queries) **todo boot**. **Fix:** gatear por carimbo em `app_settings` (como `last_recurring_gen`) + adiar ao idle.
- ⬜ **[Alta]** `lib/kanbanDnd.tsx:108-120` `setOverStatus` a cada frame de drag re-renderiza todos os cards (Música/Conteúdo/Tarefas). **Fix:** `React.memo` nos cards + estado de "over" fora do React (ref/classe) ou só quando muda de coluna.
- ⬜ **[Alta]** **Índices faltando** (1 migration): `gigs(promoter_contact_id)`, `gigs(venue_id)`, `parties(venue_id)`, `finance_transactions(party_id|track_id|music_cost_id)`, `classes(student_package_id)`, `student_packages(student_id)`, `gig_tracks(gig_id|track_id)`, `okr_kr_tasks(okr_id,kr_index)`, `track_*(track_id)`, `music_project_costs(project_id|track_id)`, `content_snapshots(content_id)`, `suppliers(contact_id)`.
- ⬜ **[Alta]** N+1: `objetivos/api.ts:46-64` `syncKrCompletions` · `fans/api.ts:241-261` `recomputeAllFanLevels` (1+2N) · `gigs/api.ts:512-606` `loadInsights` puxa `SELECT *` de ~70 colunas pra contar em JS. **Fix:** agregados em SQL / 2 reads + batch.
- ⬜ **[Alta]** **Listas grandes sem virtualização** (não há lib instalada) — Spreadsheet de GIGs (N×14 células + 4 closures/célula), List/Bulk de GIGs, Transações, Tarefas (Compact/List), Música, Conteúdo, CRM/Pessoas, Aulas, Fãs. **Precisa de lib** (`@tanstack/react-virtual`) + `React.memo` nas linhas. 🟦 *decisão: adicionar a dependência?*
- ⬜ **[Méd]** Agrupamentos/derivações refeitos a cada render (memoizar): kanbans (`TaskKanbanView:16`, etc.), `TaskSprintView`/`TaskEisenhowerView` (chamam `todayISO()`/`getWeekBounds` por tarefa), `PortfolioView`, dashboard cards, `ProjectProfitView:80` (derrota o `useTableSort`), `FinancePage:197`.
- ⬜ **[Méd]** Busca sem debounce refaz query+derivação por tecla: `finance/gigs/tasks/content/classes/fans` Page. `ClassesPage` refaz 3 listas por caractere.
- ⬜ **[Méd]** `NotificationBell` roda as 3 queries de CRM **duas vezes** por trigger (`:255` e `:265`) e `loadExtraStats`/custom-rules sem cache (≠ `loadWeekStats`).

---

## ⬜ Limpeza restante
- ⬜ Consolidar helpers duplicados: `joinPath` (3×), base64↔bytes/data-URL (4×), `relUnderUploads`/`relativize` — num `lib/paths.ts`/`lib/bytes.ts`.
- 🟦 `STATE.md` (raiz) está desatualizado ("MusicGest", "Batch P") — deletar ou reescrever. *(não criei esse arquivo; deixo a decisão.)*

---

### Sugestão de ordem pra resolver o resto
1. Datas UTC + `Promise.all` catches + NaN/JSON guards (lote 2 — seguro, rápido).
2. Índices (1 migration) + `PendingTasksBadge` batelado + gatear retro-sync no boot (ganho grande, baixo risco).
3. Decisões 🟦: CSP/scopes, criptografia padrão, privacidade do espelho, virtualização.
4. Memoizações de render + debounce de busca.
