# Auditoria do Vistage — 2026-06-26

> Auditoria sistemática (read-only) do app inteiro na branch `auditoria/2026-06-26` (base = `main`, commit `1c17cec`). Cada achado traz **evidência** (`arquivo:linha` ou saída de comando) e **severidade** (🔴 crítico · 🟠 alto · 🟡 médio · ⚪ baixo/info). A zona proibida (backup/restore/migrations/cripto/escopo de segurança) é **só proposta** — nada aplicado sem o seu "ok".

---

## Sumário executivo

| Severidade | Qtd |
|---|---|
| 🔴 Crítico | 3 |
| 🟠 Alto | 11 |
| 🟡 Médio | ~16 |
| ⚪ Baixo/info | vários |

**Saúde geral: o código é limpo na dívida superficial.** `tsc` zero erros, `vite build` ok, **0** `console.log`/`debugger`, **0** `as any`/`@ts-ignore`, **0** TODO/FIXME reais, backend Rust **sem panics em caminho de dados**, criptografia sólida (nonce GCM fresco por operação, chave não-extraível), RLS do Supabase correto, whitelist do SE/ENTÃO sem injeção, seed não embarca sozinho, nenhum segredo privado no repo/histórico. **Os achados de peso são de arquitetura de dados e de robustez (falhas silenciosas), não sujeira.**

### Os 5 itens mais urgentes
1. 🔴 **6 tabelas somem no save** — `task_links`, `fan_perks`, `fan_lists`, `fan_list_members`, `focus_blocks`, `recurring_fests` não estão em `TABLES` (`backup.ts`) → nunca entram no `.vistage`, nunca voltam, nunca são limpas. Perda silenciosa + vazamento entre documentos. **(zona proibida — proposta pronta abaixo)**
2. 🔴 **CSP desligada + `fs`/`asset` com escopo `**`** — a webview pode ler/escrever/apagar qualquer arquivo do disco, sem Content-Security-Policy. **(zona proibida — proposta pronta)**
3. 🔴 **Edições do Dia D (Operação) perdidas em silêncio** — `OperacaoTab.tsx` faz `setState` otimista + escrita sem try/catch nem `.catch`; falha = a UI mostra a mudança mas nada persistiu.
4. 🟠 **Datas que GRAVAM dado off-by-one à noite (Brasil UTC-3)** — `IdeaForm` (prazo de tarefa), `royalties.ts` (data de receita), `fans/api.ts` (data de entrega de brinde) usam `new Date().toISOString().slice(0,10)` sobre um instante.
5. 🟠 **`App.tsx` consome o "skip-wipe" antes de uma falha retriável** — "Tentar novamente" após erro de init pode `clearDocumentData()` e apagar o documento recém-aberto.

### O que já corrigi nesta branch (seguro) vs. o que aguarda seu "ok"
- **Corrigido agora (apresentação/erro, não toca dados):** ver seção **"Correções aplicadas"** no fim.
- **Aguardando aprovação (toca dados/save/segurança):** tudo marcado **"Seguro agora? N"** nas tabelas — em especial backup (#1), CSP/escopo (#2), e os bugs de escrita/data.

---

## Ferramentaria (saídas reais)

| Comando | Resultado |
|---|---|
| `tsc --noEmit` | **exit 0** — zero erros de tipo |
| `vite build` | **exit 0** — `✓ built in ~16s` (warning só de chunk >500kB, cosmético) |
| `eslint` | **não há config** no projeto (`.eslintrc*`/`eslint.config.*` ausentes; sem script `lint`) — *gap*: sem lint automatizado |
| `npm audit` | **5 vulns (1 high, 4 moderate)** — todas dev-tooling ou baixo impacto, ver §4.6 |
| `cargo check` / `clippy` | **não verificado** — sandbox sem libs GTK (`gdk-3.0` ausente); o CI compila no macOS/Windows. Rust auditado **estaticamente** (grep), ver §1.3 |
| smells (`grep`) | `console.log`=0 · `debugger`=0 · `as any`=0 · `@ts-ignore`=0 · TODO/FIXME reais=0 · `catch {}`=0 |

`npm audit` detalhado: **HIGH** `vite` (path traversal em optimized-deps `.map`, **só dev-server**) · **MOD** `esbuild` (dev-server), `react-router`/`-dom` (open redirect por URL protocol-relative — app local-first, sem navegação não-confiável), `dompurify` (transitiva de `jspdf`, **não usada** no código). **Nenhuma na superfície de runtime do app empacotado.** Mitigação: `npm audit fix` (react-router) é seguro; vite/esbuild exigem major bump (avaliar à parte).

---

## §2.1 — Cobertura de backup do `.vistage` (a mais crítica)

`build`/`restore`/`clear` derivam todas da **mesma** const `TABLES` (`backup.ts:24-98`). Logo, tabela fora de `TABLES` = ausente das **três** ao mesmo tempo (nunca salva, nunca restaurada, nunca limpa). 75 tabelas de dados no schema; **67 cobertas**, **2 são máquina** (`app_settings`, `gcal_auth` em `MACHINE_TABLES:485` — salvas/restauradas, só poupadas do wipe), **6 causam perda real**, **2 são não-issue**.

### 🔴 Perda silenciosa de dados (6 tabelas — toca dado vivo)
| Tabela | Onde é escrita | Impacto |
|---|---|---|
| **`task_links`** | `tasks/api.ts:405,423` | Todo vínculo explícito tarefa↔(GIG/conteúdo/fã) some no save/reopen. **É o vínculo das tasks #79/#98.** |
| **`fan_perks`** | `fans/api.ts:717` | Brindes/perks do fã perdidos |
| **`fan_lists`** | `fans/api.ts:565` | Listas de fãs perdidas |
| **`fan_list_members`** | `fans/api.ts:612` | Membros das listas perdidos |
| **`focus_blocks`** | `foco/api.ts:430` | Trilha da semana inteira perdida (e alimenta notificações em `notify.ts`) |
| **`recurring_fests`** | `gigs/forms/RecurringFestField.tsx:39` | Nomes de festas recorrentes (autocomplete) perdidos |

> **Também** ausentes de `clearDocumentData` → no modelo "abre em branco", linhas do documento A **persistem no documento B** na mesma máquina (vazamento cruzado). Para `task_links` há risco de **correção**: vínculo stale pode casar com id reaproveitado e ligar a tarefa à entidade errada. `hasAnyDocumentData` também não enxerga essas 6 → doc "em branco" com perks/links/focus-blocks é julgado vazio.

### ⚪ Não-issue
- **`decisions`** (`migrations.ts:792`) — tabela **morta**, zero leitura/escrita no `src/` (só o `CREATE TABLE`). Schema cruft; ou usar ou remover (drop = zona proibida).
- **`todoist_tombstones`** (`migrations.ts:1761`, escrita `todoist.ts:248`, drenada+deletada após flush) — bookkeeping transitório de sync, comporta-se como tabela-máquina. Aceitável; merece comentário.

### Proposta (NÃO aplicada — zona proibida §0.3)
Adicionar as 6 ao array `TABLES` (`backup.ts:24-98`) em ordem topológica (pais antes de filhos):
- `fan_lists`, `fan_perks` → depois de `fans`;
- `fan_list_members` → depois de `fan_lists`;
- `focus_blocks`, `recurring_fests` → standalone;
- `task_links` → depois de `tasks` **+** avaliar entrada em `DEFERRED_FK` para `task_id` (a `entity_id` é polimórfica, sem FK).
Mudança aditiva e de baixo risco, mas mexe no restore — por isso **espera seu "ok"**. (Anexo: matriz completa de 75 tabelas no fim do arquivo.)

---

## §2.2–2.4 — Zona proibida: migrations · restore · cripto (só proposta)

### Migrations (`migrations.ts`)
- ⚪ **Idempotência ok** — runner pré-filtra `ALTER ADD COLUMN` via `columnExists` (`:2197-2204`); todos os `ADD COLUMN NOT NULL` têm `DEFAULT` (30/30); `CREATE TABLE/INDEX` usam `IF NOT EXISTS`. `_migrations` (PK version) consistente; versões 1..147 **sem duplicatas** (faltam só os números 58 e 77 — cosmético, runner itera o array).
- 🟠 **Runner continua após migration falhar** (`:2205-2219`): em erro grava `migration_error_vN` em `app_settings` e `continue` — **não para**. Se a *N* falha e *N+1..max* passam, o schema fica com buraco em `_migrations` e nunca re-roda a *N*. **É exatamente o drift que a migration de reparo v90 teve que limpar.** *Proposta: abortar o loop na 1ª falha (ou bloquear migrations dependentes).*
- ⚪ **v90 (reparo)** — re-emite ~85 `ADD COLUMN` históricos guardados por `columnExists`; conserta bancos parcialmente migrados (o modo de falha acima, da era pré-batch-atômico). Re-rodável com segurança. O risco residual é o mesmo do 🟠 acima.
- 🟡 v56 tem `INSERT` de backfill **sem `WHERE NOT EXISTS`** (`:1189-1206`), diferente do padrão seguro de v59 (`:1225`). Salvo hoje pela atomicidade do batch; *proposta: alinhar ao padrão de v59.*
- 🟡 split de statements por `;` (`:2186`) — seguro hoje (não há `;` em string/trigger), mas é armadilha latente p/ migration futura com `;` em literal.

### Restore (`backup.ts:806`)
- ⚪ **2 passagens + FK adiada sólidas** — FKs nuláveis em `DEFERRED_FK` (`:778-804`) entram NULL na 1ª passagem e religam na 2ª **só se o pai existir** (`:889`), descartando órfãos. Limpeza+reinserção num **único batch atômico** (`:903`, BEGIN/COMMIT/ROLLBACK no Rust). Ordem topológica de `TABLES` correta. Ciclo gig↔task quebrado por deferir `gigs.main_goal_task_id`/`tasks.gig_id`/`tasks.contact_id`.
- 🟡 **`PRAGMA foreign_keys = OFF` fora da transação** (`:901-906`): como a conexão Rust é **única e compartilhada** (`db.rs:19,157` — não é pool; os comentários em `backup.ts:759-763` que falam de "pool" estão **desatualizados**), um crash entre o OFF e o `finally ON` deixa FK desligada o resto da sessão. *Proposta: re-afirmar `foreign_keys = ON` no início de cada restore.*
- ⚪ reescrita de caminho de upload (old→new uploadsDir) cobre os 3 formatos (path puro, JSON-array, JSON-array-de-objetos); roda **após** o batch (não atômica com ele — falha aqui deixa paths não-reescritos; menor). Leitura de anexo com timeout 12s + concorrência 6 + fallback no uploadsDir atual.

### Cripto (`crypto.ts`)
- ⚪ **Nonce GCM fresco por operação** (`:123-124` `getRandomValues` de salt 16B + IV 12B por `encryptBytes`, 1×/save). Não existe `encryptString` (o Envelope legado é decrypt-only) → **sem reuso de nonce**. AES-GCM-256 + PBKDF2-SHA256 210k iters.
- ⚪ Chave derivada **não-extraível** (`extractable=false`, `:59`); nunca logada nem gravada em claro; senha nunca vai a arquivo.
- 🟡 **Senha em `sessionStorage` em claro** (`docPassword.ts:36`) p/ re-salvar sem re-perguntar; per-origin, limpa no relançamento — mas em plataformas que persistem sessionStorage em disco, toca disco transitoriamente. *Proposta: manter só em variável de módulo (aceitando re-prompt após reload).*
- ⚪ "Sem recuperação" e "dica fica legível" avisados na UI (`PasswordPromptDialog.tsx:132-136,127`), gated no fluxo de definir senha. Correto.

---

## §3 — Bugs

### Datas / timezone (Brasil UTC-3) — maior volume
Há helper correto (`lib/format.ts` `toLocalISODate`/`todayISO`). O bug é onde se usa `new Date().toISOString().slice(0,10)` sobre um **instante** (após ~21h BRT vira o dia seguinte). Confirmado empiricamente com `TZ=America/Sao_Paulo`.

| Sev | Achado | Evidência | Risco | Seguro agora? |
|---|---|---|---|---|
| 🟠 | Prazo de tarefa +60d grava dia adiantado à noite | `ideas/forms/IdeaForm.tsx:165-174,225` | Persiste due_date errado | **N** (grava dado) |
| 🟠 | Data de receita (royalties) sem data → off-by-one | `finance/royalties.ts:525` | Receita no dia/mês errado | **N** (dado financeiro) |
| 🟠 | Data de entrega de brinde off-by-one | `fans/api.ts:742` | Registro errado | **N** (grava dado) |
| 🟡 | Janelas de alerta de recebíveis (in7/in14/hoje) | `revisao/partyFinanceAlerts.ts:20,29` | Cobrança dispara/atrasa 1 dia | **N** |
| 🟡 | `today`/`cutoff` + semana-no-domingo (diverge de seg-feira) | `components/shared/NotificationBell.tsx:66-70,138,170,198` | Estatísticas do sino deslocadas | **N** |
| 🟡 | `autoPausePartnerships` cutoff 60d off-by-one | `crm/api.ts:263-265` | Mínimo | **N** |
| ⚪ | `suggestStatus` festa de hoje vira "Realizada" cedo | `parties/forms/PartyForm.tsx:81` | Só sugestão | **N** |
| ⚪ | `in30` janela "próximas festas" desloca 1 dia | `dashboard/DashboardPage.tsx:919` | Cosmético | **S** (filtro de exibição) |
| ⚪ | `daysAhead` due de debrief off-by-one | `gigs/components/DebriefTasks.tsx:13-16` | Inconsistente c/ versão server-side | **N** |
| ⚪ | stamp de nome de arquivo de export | `backup.ts:728`, `csv.ts:139,195,227`, `document.ts:232`, `App.tsx:215` | Só o nome | **S** |

*Path seguro confirmado (sem bug):* geração de recorrências financeiras (`finance/api.ts:770+`), `snooze.ts` (epoch ms), `gigs/api.ts` prep/debrief due (`T00:00:00`).

### Rejeições de promise não tratadas (write paths) — não há handler global de `unhandledrejection`
| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🔴 | **Operação/Dia D**: `patch`/`remove`/`move`/`setHousePending` sem try/catch, chamados via `void`; `setRows` otimista roda mesmo em falha → edição "colada" mas não salva | `parties/components/OperacaoTab.tsx:77-94,130-207` | **N** (write path) |
| 🟠 | Grade de Músicas: `saveCell` sem try/catch, `onBlur` sem `.catch` | `biblioteca/views/Musicas.tsx:236,529-531` | **N** |
| 🟠 | Bulk de tarefas: `Promise.all(map(update/delete))` sem try/catch; call-site limpa seleção sincronamente | `tasks/TasksPage.tsx:153-174`, `tasks/views/TaskListView.tsx:99-134` | **N** |
| 🟠 | **Sistêmico**: `Promise.all` em loop de escrita não é atômico (aborta no 1º erro, subconjunto já commitado) | `tasks/TasksPage.tsx:156-171`, `gigs/views/BulkListView.tsx:101-117` | **N** (propor `allSettled` + "N de M falharam") |
| 🟡 | Vários deletes/saves inline sem try/catch (linha fica na tela em falha) | `foco/FocoPage.tsx:259-321`, `foco/WeekTrack.tsx:352,519`, `biblioteca/views/{Conhecimento,Documentos,GigLibraryPicker}`, `parties/components/IngressosTab.tsx:298,309`, `tasks/components/SubtaskList.tsx:86` | **N** |

### Catch que engole erro (escritas/sync)
| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🟠 | Retro-sync financeiro carimba `last_retro_sync` **mesmo com falha parcial** → transação que nunca sincroniza some até o dia seguinte | `finance/api.ts:1274-1312` | **N** (dinheiro) |
| 🟠 | `deleteTask`: falha do tombstone Todoist é engolida → próximo sync **re-importa a tarefa "deletada"** | `tasks/api.ts:217-223` | **N** (integração) |
| 🟡 | Espelhamento status→tarefa e auto-complete KR / nível-de-fã com `.catch(()=>{})` deixam derivados stale sem aviso | `gigs/api.ts:214-275`, `parties/api.ts:172-184`, `content/api.ts:111-237`, `objetivos/api.ts:64`, `fans/api.ts:289-291` | **N** |
| ⚪ | No **restore**, falha ao gravar anexo recuperado é silenciosa (save avisa, restore não) | `backup.ts:395-397,531,912` | **N** (zona proibida) |

> *OK por design (~110 sites best-effort):* hidratação de prefs/tema, integrações offline, espelho mobile, notificações, `rotatingBackup` ("erro aqui NUNCA quebra o save"). **Nenhum data-loss silencioso no path primário de save/open/restore** (todos surfaceiam via toast).

### Race conditions / ordenação (boot/save)
| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🟠 | Skip-wipe lido+removido **antes** de `initDatabase` (que pode falhar) → "Tentar novamente" re-roda com wipe e apaga o doc recém-aberto | `App.tsx:199-200,226,326-331` | **N** (boot/dados) |
| 🟠 | Writes após `await` no path wipe/reopen **sem checar `cancelled`** → `currentPath` inconsistente com o DB se `dbRetry`/`reset` no meio | `App.tsx:226-240,256,297` | **N** |
| 🟡 | **Abrir um `.vistage` marca o doc como "sujo"**: `syncAllIntegrations` pós-boot escreve+emite `DATA_CHANGED`, `UnsavedCloseGuard` marca dirty + recovery, sem o usuário editar | `App.tsx:284-293`, `UnsavedCloseGuard.tsx:35-38` | **N** |
| 🟡 | Ctrl+S nos primeiros ms lê estado parcialmente mutado pelos 6 boot writes (arquivo salvo inconsistente; sem corrupção) | `App.tsx:269` | **N** |
| 🟡 | 6 boot writes concorrentes na tabela `tasks`; re-run via `dbRetry` pode duplicar (TOCTOU select-then-insert de aniversário) | `App.tsx:269-283`, `crm/api.ts:217-233` | **N** |

### §1.3 — Rust panics: **limpo**
Backend Rust (6 arquivos) **sem panic em caminho de dados**. Todos os `db_*`/`gdrive_*`/`gcal_*`/`audio_*` usam `Result`+`map_err`; `db_execute_batch` é transacional. Únicos `.unwrap()/.expect()`: `gcal.rs:230` (bytes estáticos de header OAuth) e `lib.rs:65` (startup do runtime) — ⚪, não data path. `audio.rs` degrada com `.ok()?`. (Verificação por compilador `cargo check` **não rodou** — sandbox sem GTK; análise estática por grep.)

---

## §4 — Segurança

| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🔴 | **CSP desligada** (`csp: null`) — nenhuma Content-Security-Policy injetada | `src-tauri/tauri.conf.json:25` | **N** (zona proibida) |
| 🔴 | **`assetProtocol.scope` e `fs:scope` com `**`** + `fs:allow-read/write/remove` → webview lê/escreve/apaga **disco inteiro** | `tauri.conf.json:26-29`, `capabilities/default.json:21-34` | **N** (zona proibida) |
| 🟠 | TipTap salva **HTML cru** no `.vistage` (`getHTML`); hoje neutralizado pelo ProseMirror, mas sem CSP por trás vira XSS→disco se renderizado fora do editor | `biblioteca/components/RichNoteEditor.tsx:74-75,103` | **N** |
| 🟡 | Câmbio chama `api.frankfurter.app` via `fetch` **global** (fora do allowlist `http`); com CSP null, sem `connect-src` limitando destino | `finance/royalties.ts:395`, `capabilities/default.json:36-39` | **N/S** (propor: rotear por plugin-http + allowlist) |
| 🟡 | Sessão portátil (refresh_token Supabase) viaja **dentro** do `.vistage` | `lib/supabase.ts:51-71` | **N** (propor TTL/revogação) |
| ⚪ | Chave Supabase no código é **publishable/anon** (esperada client-side; segura porque há RLS) — **não é vazamento** | `lib/supabase.ts:6-7`, `mobile/src/supabase.ts:5-6` | — |
| ⚪ | **RLS presente e correto** em todas as tabelas-espelho + `capture_inbox` (`user_id = auth.uid()`); `app_secrets` RLS sem policy (só service_role) | `supabase/schema.sql:105-131,289` | — |
| ⚪ | **Nenhum segredo privado** no working tree nem em 641 commits do histórico (só nomes de variável/storage keys; OAuth secret é do próprio usuário, em runtime) | grep + `git log --all -S` | — |
| ⚪ | **SE/ENTÃO sem injeção** (re-confirmado): tabela/coluna/operador só do catálogo; só `value` bindado em `$1/$2` | `revisao/customRules.ts:294-299,379-485` | — |
| ⚪ | Markdown/print escapados; `react-markdown` está no package mas **não é importado**; `dompurify` é transitiva não-usada | `content/forms/ContentForm.tsx:126`, `meetings/ataPrint.ts:15` | — |

### Proposta de escopo + CSP (NÃO aplicada — zona proibida)
```jsonc
// tauri.conf.json
"assetProtocol": { "enable": true, "scope": ["$APPDATA/**","$APPLOCALDATA/**","$RESOURCE/**"] },
"security": { "csp": "default-src 'self'; img-src 'self' asset: data: blob:; connect-src 'self' https://*.supabase.co https://api.todoist.com https://api.notion.com https://oauth2.googleapis.com https://www.googleapis.com https://api.frankfurter.app; style-src 'self' 'unsafe-inline'; script-src 'self'" }
// capabilities/default.json fs:scope → $APPDATA/$APPLOCALDATA + uploadsDir (não **)
```
Caminhos escolhidos por `dialog` recebem permissão dinâmica, então abrir/salvar `.vistage` e imagens segue funcionando sem `**`. **Exige teste no build real antes do merge.**

---

## §5 — Limpeza

| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🟡 | Código morto: `PageToolbar.tsx` sem importadores (substituído por `ModuleToolbar`) | `components/shared/PageToolbar.tsx` (0 imports) | **S** |
| 🟡 | Código morto: `TypeBadges.tsx` (+ `sortContactTypes`) sem importadores | `modules/crm/components/TypeBadges.tsx` (0 imports) | **S** |
| 🟠 | **P&L da festa duplicado em 4 lugares** com bases divergentes (`quantity_sold` cru vs `||0` → risco de `NaN`); qualquer mudança de regra precisa replicar à mão | `parties/components/OrcamentoTab.tsx:48-51`, `PartyCockpit.tsx:25-34`, `briefing.ts:81-88`, `api.ts:759-765` | **N** (cálculo de dinheiro; consolidar em `computePartyPnL` com teste) |
| ⚪ | `decisions` tabela morta (ver §2.1); `console.log`/`as any`/TODO/seed = limpos | — | — |

---

## §6 — UX (nível de código)

| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🟠 | **6 de 7 páginas-lista engolem falha de fetch**; só GigsPage avisa. **PartiesPage trava no spinner para sempre** se `listParties` rejeitar (`setLoading(false)` após o `await`) | `parties/PartiesPage.tsx:40-44`, `tasks/TasksPage.tsx:98-106`, `fans/FansPage.tsx:114-128`, `content/ContentPage.tsx:72-75`, `finance/FinancePage.tsx:142-154`, `music/MusicPage.tsx:52-56` | **S** (estado de erro ausente, path de leitura) |
| 🟡 | Loading state inconsistente (Skeleton vs Loader2 vs texto vs nenhum) entre páginas equivalentes | `FansPage:246` (Skeleton) vs `PartiesPage:119` (Loader2) vs `TasksPage:305` (texto) vs Gigs/Content/Music (nenhum) | **S** |
| 🟡 | Empty state inconsistente (`EmptyState` compartilhado vs caixa ad-hoc) | `ContentPage:220-227`, `PartiesPage:123-129` ad-hoc | **S** |
| ⚪ | Feedback de operação longa (save/open/sync) — **bem coberto** (toast em todos os caminhos) | `document.ts:145-256`, `integrationsSync.ts:69` | — |

---

## §7 — Funcionalidades

| Sev | Achado | Evidência | Seguro agora? |
|---|---|---|---|
| 🟠 | Rótulo genérico **"Sincronizar"** superdimensiona integrações push-only: **Notion** é só envio (edição no Notion **não** volta — é sobrescrita; página apagada localmente vira órfã; página apagada no Notion é **recriada**); **Google Calendar** é push (classes/festas/OKRs **não** removem evento → órfãos no Google; **drift não roda no auto-sync**) | `notion.ts:4,211-352`, `gcal.ts:414-419,459,483-512`, `GigsPage.tsx:222` | Texto do botão **S**; lacuna funcional (delete/drift) **N** |
| ⚪ | Sem stubs "em breve", sem botões mortos, sem `onClick` vazio, sem `disabled` permanente | grep | — |

**Direção real das integrações:** Todoist = **two-way real** (delete propaga via tombstone) · Google Calendar = **push-only** (pull só p/ drift read-only) · Notion = **push-only** · Mobile/Supabase = **two-way assimétrico** (push snapshot automático; pull de capturas só funde por clique do usuário).

---

## Correções aplicadas nesta branch (seguras, isoladas, não tocam dados)

Ver commits da branch. Resumo:
1. **Removido código morto** `PageToolbar.tsx` e `TypeBadges.tsx` (zero importadores, verificado).
2. **Estado de erro nas páginas-lista**: `catch → toast.error` em Tasks/Fans/Content/Finance/Music/Parties; **corrigido o spinner travado da PartiesPage** (loading liberado no `finally`).

## Aguardando seu "ok" (toca dados / save / segurança — zona proibida ou write path)
- 🔴 **Backup**: registrar as 6 tabelas em `TABLES` (proposta em §2.1).
- 🔴 **Segurança**: restringir `fs`/`asset` scope + definir CSP (proposta em §4).
- 🔴/🟠 **Bugs de escrita**: OperacaoTab (Dia D), bulk `Promise.all`→`allSettled`, Musicas saveCell, datas que gravam dado (IdeaForm/royalties/fans).
- 🟠 **Boot/save**: skip-wipe antes de falha, checagens de `cancelled`, dirty-on-open, migration runner parar na 1ª falha.
- 🟠 **Integrações/dinheiro**: retro-sync financeiro carimbar "feito" só sem falha; tombstone Todoist; propagação de delete (Notion/GCal); drift no auto-sync.
- 🟠 **Manutenção**: consolidar P&L da festa em `computePartyPnL`.
- 🟡 **Cripto/sessão**: senha fora do sessionStorage; TTL da sessão portátil.

---

## Anexo — Matriz de cobertura de backup (75 tabelas de dados)

Legenda: ✓ coberta · ✗ **ausente** · build = `TABLES`→buildBackupData · restore = restoreBackup · clear = clearDocumentData · csv = `CSV_ENTITIES`.

| tabela | build | restore | clear | csv |
|---|:--:|:--:|:--:|:--:|
| app_settings | ✓ | ✓ | — (máquina) | ✗ |
| artist_identity | ✓ | ✓ | ✓ | ✗ |
| artist_templates | ✓ | ✓ | ✓ | ✗ |
| class_packages | ✓ | ✓ | ✓ | ✓ |
| classes | ✓ | ✓ | ✓ | ✓ |
| contact_interactions | ✓ | ✓ | ✓ | ✗ |
| contacts | ✓ | ✓ | ✓ | ✓ |
| content | ✓ | ✓ | ✓ | ✓ |
| content_scenes | ✓ | ✓ | ✓ | ✗ |
| content_snapshots | ✓ | ✓ | ✓ | ✗ |
| custom_rules | ✓ | ✓ | ✓ | ✗ |
| **decisions** | ✗ | ✗ | ✗ | ✗ |
| dismissed_insights | ✓ | ✓ | ✓ | ✗ |
| document_links | ✓ | ✓ | ✓ | ✗ |
| document_settings | ✓ | ✓ | ✓ | ✗ |
| drive_documents | ✓ | ✓ | ✓ | ✗ |
| equipment | ✓ | ✓ | ✓ | ✗ |
| fan_group_members | ✓ | ✓ | ✓ | ✗ |
| fan_groups | ✓ | ✓ | ✓ | ✗ |
| fan_interactions | ✓ | ✓ | ✓ | ✗ |
| **fan_list_members** | ✗ | ✗ | ✗ | ✗ |
| **fan_lists** | ✗ | ✗ | ✗ | ✗ |
| **fan_perks** | ✗ | ✗ | ✗ | ✗ |
| fans | ✓ | ✓ | ✓ | ✓ |
| finance_categories | ✓ | ✓ | ✓ | ✓ |
| finance_recurring | ✓ | ✓ | ✓ | ✗ |
| finance_transactions | ✓ | ✓ | ✓ | ✓ |
| **focus_blocks** | ✗ | ✗ | ✗ | ✗ |
| gcal_auth | ✓ | ✓ | — (máquina) | ✗ |
| gig_debrief_drafts | ✓ | ✓ | ✓ | ✗ |
| gig_fans | ✓ | ✓ | ✓ | ✗ |
| gig_library_tracks | ✓ | ✓ | ✓ | ✗ |
| gig_setlists | ✓ | ✓ | ✓ | ✗ |
| gig_tracks | ✓ | ✓ | ✓ | ✗ |
| gigs | ✓ | ✓ | ✓ | ✓ |
| highlights | ✓ | ✓ | ✓ | ✓ |
| ideas | ✓ | ✓ | ✓ | ✓ |
| library_tracks | ✓ | ✓ | ✓ | ✓ |
| manual_insights | ✓ | ✓ | ✓ | ✗ |
| meetings | ✓ | ✓ | ✓ | ✓ |
| music_project_costs | ✓ | ✓ | ✓ | ✗ |
| music_projects | ✓ | ✓ | ✓ | ✓ |
| note_folders | ✓ | ✓ | ✓ | ✗ |
| note_links | ✓ | ✓ | ✓ | ✗ |
| note_note_tags | ✓ | ✓ | ✓ | ✗ |
| note_tags | ✓ | ✓ | ✓ | ✗ |
| notes | ✓ | ✓ | ✓ | ✓ |
| okr_kr_tasks | ✓ | ✓ | ✓ | ✗ |
| okrs | ✓ | ✓ | ✓ | ✓ |
| parties | ✓ | ✓ | ✓ | ✓ |
| party_budget_items | ✓ | ✓ | ✓ | ✗ |
| party_costs | ✓ | ✓ | ✓ | ✓ |
| party_guests | ✓ | ✓ | ✓ | ✗ |
| party_runsheet | ✓ | ✓ | ✓ | ✗ |
| party_series | ✓ | ✓ | ✓ | ✗ |
| party_stages | ✓ | ✓ | ✓ | ✗ |
| party_tasks | ✓ | ✓ | ✓ | ✗ |
| party_tickets | ✓ | ✓ | ✓ | ✗ |
| party_venue_candidates | ✓ | ✓ | ✓ | ✗ |
| **recurring_fests** | ✗ | ✗ | ✗ | ✗ |
| student_packages | ✓ | ✓ | ✓ | ✗ |
| students | ✓ | ✓ | ✓ | ✓ |
| subtasks | ✓ | ✓ | ✓ | ✗ |
| supplier_services | ✓ | ✓ | ✓ | ✗ |
| suppliers | ✓ | ✓ | ✓ | ✗ |
| **task_links** | ✗ | ✗ | ✗ | ✗ |
| tasks | ✓ | ✓ | ✓ | ✓ |
| **todoist_tombstones** | ✗ | ✗ | ✗ | ✗ (transitória) |
| track_collaborators | ✓ | ✓ | ✓ | ✗ |
| track_flow_sessions | ✓ | ✓ | ✓ | ✗ |
| track_media_targets | ✓ | ✓ | ✓ | ✓ |
| track_performance_snapshots | ✓ | ✓ | ✓ | ✗ |
| tracks | ✓ | ✓ | ✓ | ✓ |
| venues | ✓ | ✓ | ✓ | ✓ |
| work_sessions | ✓ | ✓ | ✓ | ✓ |
