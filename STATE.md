# STATE.md — MusicGest

Briefing pra qualquer Claude (ou pessoa) retomar o projeto rapidamente.
Última atualização: Batch M (Cross-pollination — conexões entre módulos).

---

## 1. O que é

**MusicGest** — sistema desktop de gestão pra DJ / produtor musical /
criador de conteúdo. **Local-first**: roda em Mac/Windows, banco SQLite
guardado num HD externo escolhido pelo usuário. Tudo em PT-BR.

Usuário final: **um DJ produtor amador** que se chama Matheus. Não
desenvolvedor. Lê código vagamente. Pede mudanças de UX e features.

---

## 2. Stack

- **Desktop**: Tauri 2 (Rust + WebView)
- **Frontend**: React 18, Vite, TypeScript estrito, Tailwind, shadcn-style components
- **Banco**: SQLite via `@tauri-apps/plugin-sql`, **path escolhido pelo usuário**
  (configurável, fica no HD externo). Migrations versionadas em
  `src/lib/migrations.ts` (v1 → v10)
- **Estado**: Zustand (theme, config)
- **Charts**: Recharts (lazy-loaded só no /financeiro)
- **OAuth Google Calendar**: PKCE puro em Rust (`tiny_http` + `ureq` + `sha2`),
  ad-hoc signing pra macOS
- **Uploads**: `@tauri-apps/plugin-fs` + helper `src/lib/uploads.ts`,
  imagens exibidas via **data URL** (não `convertFileSrc` — que não
  funciona com paths arbitrários)

---

## 3. Branch / repo / CI

- **Repo**: `matheusfpimentel-wq/gm-`
- **Branch de trabalho**: `claude/music-business-management-TL7Cf`
- **PR aberto**: #1 (rastreia o CI)
- **CI**: `.github/workflows/build.yml` — builda macOS e Windows a cada push,
  artifacts ficam em Actions > último run > Artifacts
- **Sem código no main** ainda; tudo na branch acima

---

## 4. Módulos atuais

Cada módulo mora em `src/modules/<nome>/`, com `types.ts`, `api.ts`,
`forms/`, `views/`, `components/`, e `XPage.tsx` orquestrador. Rotas
lazy-loaded em `src/App.tsx`. Sidebar em `src/components/layout/Sidebar.tsx`.

| Módulo | Rota | Estado |
|---|---|---|
| Dashboard | `/` | **(Batch H)** 4 KPIs estratégicos (receita do mês c/ tendência, GIGs do mês, pipeline criativo, alertas críticos clicáveis) + 4 cards de domínio (GIGs / Conteúdos ativos; Produção Musical e Festas como "Em breve") + linha do tempo integrada dos próximos 7 dias (GIGs+tarefas+posts no mesmo eixo) + rodapé Lei de Goodhart |
| GIGs | `/gigs` | CRUD + 4 visualizações (lista/calendário/kanban/insights), debrief automático com avaliação por estrelas, autosave, checklist de preparação fixo agrupado em Musical/Marketing/Logística |
| Venues | `/venues` | CRUD, foto, view cards/lista, detalhe com KPIs |
| CRM | `/crm` | **Pessoas** (não estabelecimentos), foto, prioridade Alta/Média/Baixa, histórico de interações |
| Clube de fãs | `/fas` | 3 níveis (Superfã/Fã/Possível fã), foto, view cards/lista, multi-select em fans_present do Debrief |
| Produção Musical | `/musica` | **(Batch I+J)** CRUD de projetos + tracks. Pipeline Stage-Gate (8 stages: Ideação→…→Pós-lançamento) com 4 gates decisórios; reprovar num gate → **Stand-by** (reativável, não "Cancelada"). Gate 1 mostra paleta/briefing da Identidade. Sub-bloco Criatividade (Flow Sessions + heatmap período×dia). Colaboradores N:N com CRM. `constraints` obrigatório (dica de Stokes). Views Kanban, Lista, **Roadmap** (12 meses) e **Portfolio** (analytics). **Sub-bloco Marketing** (release_strategy, presave_link, marketing_dates, lista mídia alvo N:N). **Sub-bloco Financeiro** (custos por projeto, ROI calculado). **Sub-bloco Performance** (snapshots mensais manuais, barras CSS). Auto-criação de 4 conteúdos ao entrar em Pré-lançamento + tarefa de métricas ao entrar em Lançamento (ambos com confirmação). **Converter Ideia em Track** no módulo Ideias |
| Aulas | `/aulas` | 3 abas (Aulas/Alunos/Pacotes), pacote-template com ementa, instância por aluno com saldo, auto-recalc do pacote quando aula vira "Realizada" |
| Conteúdo | `/conteudo` | CRUD + 3 visualizações (lista/calendário editorial/kanban), métricas manuais, tarefa-prazo automática |
| Insights | `/insights` | **(Batch L)** Pool unificado de aprendizados (v_insights VIEW). Feed cronológico com filtro por fonte (GIG/Track/Festa/Ideia), busca full-text com highlight, expand/colapso de conteúdo longo, KPI chips por fonte, exportar TXT |
| Festas | `/festas` | **(Batch K)** Produção de eventos próprios. CRUD de festas com status (Planejando/Confirmada/Realizada/Cancelada). Tabs: Info (título, data, venue, capacidade, preços), Lineup (DJs escalados N:N com CRM + patrocinadores), Custos (inline), Notas. Auto-gera 4 tarefas ao confirmar festa. KPIs: próximas, realizadas, receita estimada. Views cards e lista. Integrado em busca Ctrl+K e backup/CSV |
| Ideias | `/ideias` | Quick Capture (Ctrl+I) com modo Brain Dump, 3 visualizações (mural/kanban/lista), conversão pra Tarefa (60d) ou Conteúdo |
| Identidade Artística | `/identidade` | Nome, biografia, **paleta livre de cores**, redes sociais (14 opções), logo/isótipo/presskit, abas Flyers (auto das GIGs) e Templates |
| Tarefas | `/tarefas` | Lista + Kanban, subtarefas, prioridade, filtros chip (Hoje/Semana/Atrasadas) |
| Financeiro | `/financeiro` | 4 abas (Dashboard com Recharts/Transações/Recorrentes/Patrimônio), categorias customizáveis, auto-receita ao marcar GIG paga, patrimônio derivado de "Equipamentos" |
| Configurações | `/configuracoes` | Path do banco, Google Calendar, **CSV por entidade + JSON completo**, atalhos customizáveis, dados de exemplo, ícone de Apple seguro |

---

## 5. Convenções importantes

### Visual
- **Tema dark por padrão** (não respeita `prefers-color-scheme`).
  Toggle no header salva escolha explícita.
- Paleta **roxa** — primary HSL 263 80% 68% (dark), 262 70% 56% (light)
- Utilitários: `bg-primary-gradient`, `text-primary-gradient`, `ring-primary-glow`
- Botão `variant="dark"` é versão mais escura do gradiente roxo

### Status / labels
- GIG status (4): **Proposta · Confirmada · Concluída · Cancelada**
  (não tem "A Caminho" — foi removido)
- Promoter virou **Contratante**
- CRM: nome só (não "Nome ou estabelecimento"); 7 tipos incluindo
  "DJ parceiro" e "Outros"
- GIG: **event_name** é o campo principal (nome da festa); venue_name
  vem auto-preenchido pelo dropdown de venue cadastrado
- **"Insights"** é a nomenclatura padrão (Batch H) para o que antes era
  "Aprendizados / Experiências". O campo do banco continua
  `gigs.debrief_learnings` (sem migration destrutiva) — só o label da UI
  mudou. A view `v_insights` agrega insights de todas as fontes

### Comportamento
- Modal de Debrief abre automaticamente ao mudar status pra Concluída
- "Briefing" e "Preparação" no GigForm só aparecem se status ≠ Proposta
- Quando o usuário fecha um form com `dirty` state, pergunta antes
  (`src/lib/dirty.ts` → `useUnsavedConfirm`)
- Mod key (Ctrl/Cmd) + **K** busca global, **N** novo item, **I**
  captura rápida de ideia. **Customizáveis** em /configuracoes
- Auto-vínculo: GIG marcada "Pago integralmente" cria receita na
  categoria DJ automaticamente (idempotente via gig_id)

### Arquivos / uploads
- Helper `src/lib/uploads.ts`: `pickFile`, `saveAttachment`, `openAttachment`,
  `deleteAttachment`
- **Imagens via `useImageUrl(path)` hook** que retorna data URL.
  `assetUrl()` está deprecated e retorna null — não use
- Subpastas por categoria: `uploads/gigs/flyers/`, `uploads/identity/logo/`,
  etc

### Backup
- **JSON completo** (`src/lib/backup.ts`): export/import de TUDO,
  transação atômica
- **CSV por entidade** (`src/lib/csv.ts`): 12 tabelas individualmente,
  com modo append (preserva ids, ignora dups) ou replace
- Anexos físicos (`uploads/`) NÃO entram no JSON — copiar a pasta
  manualmente

---

## 6. Schema do banco — migrations rodadas

| # | O que faz |
|---|---|
| v1 | Schema inicial: contacts, gigs, gig_debrief_drafts, tasks, subtasks, finance_*, equipment, app_settings, gcal_auth |
| v2 | Seed das 20 categorias financeiras padrão |
| v3 | Gigs ganham main_goal, prep_state, main_goal_task_id |
| v4 | Venues, fans, fan_interactions; gigs.venue_id |
| v5 | content, ideas |
| v6 | students, class_packages, student_packages, classes |
| v7 | event_name, fans_present, photo_path em várias tabelas, syllabus em class_packages, tabelas artist_identity e artist_templates |
| v8 | Palette JSON em artist_identity |
| v9 | View `v_insights` — pool unificada de insights (gigs.debrief_learnings + ideas.body; tracks/festas entram nos batches I/L). Não-destrutiva: `DROP VIEW IF EXISTS` + `CREATE VIEW` |
| v10 | Produção Musical: `music_projects`, `tracks`, `track_collaborators`, `track_flow_sessions`, `music_project_costs`, `track_performance_snapshots`; `ALTER finance_transactions ADD track_id`; recria `v_insights` incluindo a fonte `track` (creative_block_notes). Obs: a coluna de anexos da track chama-se `reference_files` (não `references`, palavra reservada no SQLite) — a propriedade TS é `references`, mapeada na api |
| v11 | `track_media_targets` — N:N tracks × contacts para lista de mídia alvo (role: Imprensa/Curador/Influencer) |
| v12 | Festas: `parties`, `party_costs`; recria `v_insights` adicionando fonte `party` (notes) |
| v13 | `gig_tracks` — set list N:N entre gigs e tracks |

Migrations são idempotentes; nada de DESTRUTIVO. Cada migration roda
1x via tabela `_migrations`.

---

## 7. Tauri / build / distribuição

### Capabilities (`src-tauri/capabilities/default.json`)
- core, window, dialog (open/save), shell (open)
- fs: read-file, read-text-file, write-file, write-text-file,
  copy-file, mkdir, exists, remove — todos com **scope `**`** (qualquer caminho)
- sql: default, load, execute, select, close

### macOS signing
- `bundle.macOS.signingIdentity: "-"` em `tauri.conf.json` →
  **ad-hoc signing** (suficiente pra contornar "está danificado",
  mas não notarizado — aparece "Apple não pôde verificar")
- Workaround pro usuário: Configurações > Privacidade > "Abrir mesmo assim",
  ou `sudo xattr -rd com.apple.quarantine /Applications/MusicGest.app`

### Workflow
- Node 24 forçado via env var `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
  (silencia warning de deprecação)
- Builda `macos-latest` e `windows-latest`, artifacts retidos 14 dias

---

## 8. Convenções de código

- **Sem comentários óbvios.** Comentário só pra explicar WHY não-óbvio
- **PT-BR** em strings de UI e comentários longos. Nomes em inglês
- TypeScript estrito (`strict: true`, `noUnusedLocals: true`)
- Tailwind sem classes mágicas; usar `cn()` pra combinar
- shadcn-style: components em `src/components/ui/`. Não usar shadcn CLI;
  edita à mão
- Migrations: NUNCA reordene o array. Sempre adicione no final
- Forms grandes usam `function set<K extends keyof FormState>(key, value)`
  helper + `useUnsavedConfirm(dirty)` pra interceptar close

---

## 9. Limitações / pendências conhecidas

- **Macros e Apple Silicon não notarizado** → aviso "não pôde verificar"
  (custaria $99/ano + processo de notarização Apple)
- **Sync periódico do Google Calendar** é manual (botão), não em background
- **Resolução de conflito do GCal** é "última modificação ganha" pelo
  `updated_at` — não tem diff side-by-side
- **CSV import** assume header bate com colunas do banco (a UI sugere
  exportar primeiro pra ver formato). Validação é só "coluna existe na
  tabela"
- **Anexos não no backup JSON** — manualmente copiar pasta uploads/

---

## 10. Como continuar — para o próximo Claude

1. **Clone** `matheusfpimentel-wq/gm-` na branch `claude/music-business-management-TL7Cf`
2. **Lê este STATE.md** e o `README.md`
3. **Olha os últimos commits**: `git log --oneline -20` — mensagens
   detalhadas explicam cada batch
4. Pra **rodar local** (precisa Rust + Node 18+):
   ```bash
   npm install
   npm run tauri:dev
   ```
5. Pra **validar** mudanças antes de pushar:
   ```bash
   npx tsc --noEmit
   npx vite build
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
6. Pra **buildar** os instaladores: empurra na branch e o CI faz.
   Artifacts em Actions.
7. **Sempre commita e pusha** após cada feature — o usuário não
   tem como avaliar código local; trabalha em cima do CI

### Padrão de batches

Cada vez que o usuário manda uma lista de 5-10 mudanças, eu chamo de
"Batch X" e:
- Faço todas em um commit grande com corpo descritivo
- Pusho na branch
- Resumo as mudanças no chat com checklist ✅
- Aviso quando tem migration nova (v9, v10...)
- Aviso quando precisa de rebuild do CI

### O que evitar

- Não use `window.prompt` / `window.alert` — Tauri 2 webview
  bloqueia/sobrepõe. Use Dialog do Radix
- Não use `convertFileSrc` — usa `useImageUrl` hook
- Não regenere `package-lock.json` desnecessariamente
- Não adicione `console.log` em código production
- Não mude o schema sem migration nova
- Não force light mode default — usuário pediu dark

---

## 11. Arquivos-chave de referência

```
src/
├── App.tsx                    # roteador + atalhos globais + Suspense
├── lib/
│   ├── db.ts                  # SQLite load + migrations
│   ├── migrations.ts          # SCHEMA — v1 a v10
│   ├── config.ts              # caminho do banco no HD
│   ├── theme.ts               # dark default
│   ├── uploads.ts             # pickFile, saveAttachment, useImageUrl
│   ├── dirty.ts               # useUnsavedConfirm
│   ├── shortcuts.ts           # atalhos customizáveis
│   ├── backup.ts              # JSON full backup
│   ├── csv.ts                 # CSV per-entity
│   ├── search.ts              # global search
│   ├── seed.ts                # dados de exemplo
│   ├── gcal.ts                # Google Calendar wrapper
│   └── format.ts              # PT-BR date/currency
├── modules/
│   ├── gigs/{types,api,prep,displayName}.ts
│   ├── gigs/forms/{GigForm,DebriefForm}.tsx
│   ├── gigs/components/{PrepChecklist,FansPresentPicker,...}.tsx
│   ├── gigs/views/{ListView,CalendarView,KanbanView,InsightsView}.tsx
│   ├── venues/forms/{VenueForm,QuickVenueForm,VenueDetail}.tsx
│   ├── crm/forms/{ContactForm,QuickContactForm,ContactDetail}.tsx
│   ├── crm/types.ts           # ratingToPriority/priorityToRating
│   ├── fans/...
│   ├── classes/...
│   ├── music/{stages,gates,types,api}.ts          # Stage-Gate
│   ├── music/{MusicPage}.tsx + forms/{TrackForm,ProjectForm,GateDialog}
│   ├── music/components/{StageBadge,FlowSessionPanel} + views/{KanbanView,ListView}
│   ├── content/...
│   ├── ideas/forms/{IdeaForm,QuickCapture}.tsx
│   ├── identity/{types,api,IdentityPage}.ts
│   ├── tasks/...
│   ├── finance/...
│   ├── dashboard/DashboardPage.tsx
│   └── settings/{SettingsPage,CsvImportExport,GoogleCalendarSettings,ShortcutSettings}.tsx
├── components/
│   ├── ui/                    # primitivos (Button, Card, Dialog, ...)
│   ├── shared/{CommandPalette,ThemeToggle,AttachmentField}.tsx
│   └── layout/{Sidebar,AppLayout}.tsx
└── pages/Setup.tsx            # primeira execução: escolher HD
```

```
src-tauri/
├── tauri.conf.json            # config app + bundle + ad-hoc signing
├── capabilities/default.json  # permissões fs/sql/shell/dialog
├── Cargo.toml                 # tiny_http, ureq, sha2, base64, rand
└── src/
    ├── main.rs
    ├── lib.rs                 # registra plugins + handlers gcal
    ├── gcal.rs                # OAuth PKCE + Calendar API
    └── oauth_success.html
```

---

## 12. Tom / personalidade do usuário

- Direto. Manda lista de 5-10 itens por vez
- Honestidade > polidez. Reconhece quando algo não tá legal
- Curte explicações curtas, exemplos concretos
- Quando algo não funciona, pode mandar print do erro
- Não programa, mas entende fluxo lógico bem
- Linguagem PT-BR informal
