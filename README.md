# MusicGest

Sistema **local-first** de gestão para negócio musical (DJ, produtor, criador de conteúdo). Banco SQLite portátil em HD externo, app desktop nativo (Tauri 2) que roda em Mac e Windows.

---

## Funcionalidades (visão geral)

| Módulo | Rota | Resumo |
|---|---|---|
| **Dashboard** | `/` | KPIs estratégicos, cards de domínio, timeline semanal integrada (GIGs + tarefas + posts + festas no mesmo eixo) |
| **GIGs** | `/gigs` | CRUD + 4 views (lista/calendário/kanban/insights), debrief automático com avaliação, checklist de preparação, set list N:N com tracks |
| **Venues** | `/venues` | CRUD, foto, KPIs por venue |
| **CRM** | `/crm` | Contatos (pessoas), foto, histórico de interações, vínculo com GIGs/tarefas |
| **Clube de fãs** | `/fas` | 3 níveis (Superfã/Fã/Possível), presença em GIGs |
| **Produção Musical** | `/musica` | Stage-Gate 8 etapas + 4 gates decisórios, Stand-by, Flow Sessions, heatmap criativo, Roadmap 12 meses, Portfolio analytics, sub-blocos Marketing/Financeiro/Performance |
| **Aulas** | `/aulas` | Alunos, pacotes com ementa, sessões com controle de saldo |
| **Gestão de Conteúdo** | `/conteudo` | Pipeline editorial (lista/calendário/kanban), métricas manuais |
| **Banco de Ideias** | `/ideias` | Captura rápida Ctrl+I, Brain Dump, 3 views, conversão pra Track ou Tarefa |
| **Produção de Festas** | `/festas` | CRUD de festas, lineup N:N com CRM, custos inline, auto-tarefas ao confirmar, KPIs |
| **Insights** | `/insights` | Pool unificada `v_insights` (GIGs + tracks + festas + ideias), busca full-text com highlight, exportar TXT |
| **Revisão Semanal** | `/revisao` | KPIs da semana, checklist interativo persistido (6 itens), lista de foco, alertas, mini-OKRs, highlights |
| **Energia & Foco** | `/foco` | Sessões de trabalho com cronômetro, heatmap energia×dia/hora, distribuição por atividade, highlights cumulativos |
| **OKRs** | `/objetivos` | Objetivos trimestrais com key results — 5 fontes de auto-pull (GIGs, tracks, festas, conteúdos, receita) |
| **Decision Log** | `/decisoes` | Registro de decisões com contexto/opções/raciocínio, revisão posterior com outcome + avaliação |
| **Identidade Artística** | `/identidade` | Nome, bio, paleta livre de cores, redes sociais, logo/presskit, flyers das GIGs |
| **Tarefas** | `/tarefas` | Lista + Kanban, subtarefas, prioridade, filtros, recorrência semanal/mensal |
| **Financeiro** | `/financeiro` | Dashboard Recharts, transações, recorrentes, patrimônio derivado de equipamentos |
| **Configurações** | `/configuracoes` | Path do banco, Google Calendar, CSV por entidade + JSON completo, atalhos, seed |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Desktop | Tauri 2 (Rust, ~10 MB binário) |
| Frontend | React 18 + Vite + TypeScript strict + Tailwind |
| Componentes | shadcn/ui style (Radix primitives) |
| Charts | Recharts (lazy-loaded — só no módulo Financeiro) |
| Banco | SQLite via `@tauri-apps/plugin-sql` |
| Estado | Zustand |
| Datas | date-fns + locale ptBR |
| OAuth | PKCE puro em Rust (`tiny_http` + `ureq` + `sha2`) |

---

## Pré-requisitos

1. **Node.js** 18+ (recomendo 20+)
2. **Rust** estável — <https://rustup.rs>
3. Toolchain nativo do OS:
   - **macOS:** `xcode-select --install`
   - **Windows:** Microsoft C++ Build Tools + WebView2 (já vem no Win 11)

```bash
npm install
```

---

## Desenvolvimento

```bash
npm run tauri:dev
```

Na primeira execução a tela de Setup pede uma pasta no HD externo (ex: `/Volumes/HD/musicgest` no Mac ou `E:\musicgest` no Windows). O app cria `musicgest.db`, `uploads/` e `musicgest.config.json` lá.

Em **Configurações → Popular com exemplos** você gera dados de demo (GIGs, contatos, tarefas, transações) para ver o sistema funcionando rápido.

---

## Build dos instaladores

### Opção A (recomendada): GitHub Actions

A cada push, `.github/workflows/build.yml` builda Mac e Windows. Para baixar:

1. Abra <https://github.com/matheusfpimentel-wq/GM-/actions>
2. Clique no workflow mais recente (verde)
3. Baixe `musicgest-macos-latest` (`.dmg`) e/ou `musicgest-windows-latest` (`.msi`/`.exe`) em **Artifacts**

### Opção B: local

```bash
npm run tauri:build
```

Saída em `src-tauri/target/release/bundle/`. Tauri não faz cross-compile: Mac produz `.app`, Windows produz `.exe`.

> **Assinatura ad-hoc:** o binário macOS recebe assinatura ad-hoc automática (abre sem o erro "danificado" em Apple Silicon). Não é certificado pago — na primeira abertura o Mac pede clique direito → Abrir; Windows mostra SmartScreen → "Mais informações → Executar mesmo assim".

> **Se um `.dmg` antigo disser "danificado":**
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/MusicGest.app
> ```

---

## Portabilidade no HD externo

```
/Volumes/HD/musicgest/
├── musicgest.db              # banco SQLite (todo o histórico)
├── musicgest.config.json     # aponta para o db + uploads
└── uploads/                  # anexos (fotos, documentos)
```

Plugue o HD em qualquer Mac ou Windows com o executável correspondente e o app encontra os dados automaticamente. Para HD novo em máquina nova: "Abrir banco existente" no setup, aponte para `musicgest.config.json`.

---

## Integração com Google Calendar

Sincroniza GIGs com um calendário Google (opcional).

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → crie um projeto
2. **APIs & Services → Library** → ative **Google Calendar API**
3. **OAuth consent screen** → External, adicione seu e-mail como Test User
4. **Credentials → Create → OAuth client ID** → tipo **Desktop app** → copie Client ID e Client secret
5. No MusicGest → **Configurações** → cole os valores → **Salvar → Conectar**
6. Autorize no navegador que abrir
7. Escolha o calendário de destino → **Sincronizar agora**

A partir daí, toda criação/edição de GIG empurra automaticamente o evento. Tokens ficam só no `musicgest.db` local.

---

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl/Cmd + K` | Busca global (GIGs, contatos, tarefas, tracks, festas, decisões…) |
| `Ctrl/Cmd + N` | Novo item no módulo ativo |
| `Ctrl + I` | Captura rápida de ideia |
| `Ctrl + Shift + F` | Modo Foco Profundo (oculta sidebar) |

Todos os atalhos são customizáveis em **Configurações → Atalhos**.

---

## Decision Log

Registre decisões importantes enquanto toma (contexto + opções consideradas + raciocínio). Meses depois, volte e preencha o **outcome** e a **avaliação** (Acertou / Errou / Inconclusivo). A Revisão Semanal alerta quando há decisions com outcome mas sem avaliação.

Base empírica: Kahneman — explicitar critérios e revisitar reduz vieses sistemáticos.

---

## OKRs

Objetivos trimestrais (ex: `2026-Q3`) com Key Results mensuráveis. Cada KR pode ter `metric_source` automático:

| Fonte | O que puxa |
|---|---|
| `gigs_completed` | GIGs concluídas no trimestre |
| `tracks_released` | Tracks em Lançamento/Pós-lançamento |
| `parties_executed` | Festas com status Realizada |
| `content_published` | Conteúdos publicados |
| `finance_revenue` | Receita total (R$) |
| `manual` | Você atualiza manualmente |

Base: Andy Grove (Intel) / John Doerr, *Measure What Matters*. 3–5 objetivos por trimestre, 2–4 KRs cada.

---

## Energia & Foco

Widget no header para registrar sessões de trabalho com tipo de atividade. Ao encerrar, avalie energia (1–5) e foco (1–5). Após algumas semanas, `/foco` mostra:

- **Heatmap** de energia média por dia da semana × horário
- **Distribuição** de tempo por tipo de atividade
- **Highlights cumulativos** — momentos marcantes da carreira

Base: Schwartz & McCarthy, *Manage Your Energy, Not Your Time* (HBR 2007).

---

## Revisão Semanal

Checklist interativo com 6 itens, estado persistido por semana:

1. Banco de Ideias revisado
2. Tarefas da semana revisadas
3. OKRs em dia
4. Financeiro conferido
5. Decision Log atualizado
6. Insights consolidados

Cada item linka direto para o módulo correspondente. Toast de conclusão ao marcar tudo.

---

## Backup e exportação

- **JSON completo** (`Configurações → Exportar backup`): snapshot de todas as tabelas, importável com transação atômica
- **CSV por entidade**: cada tabela individualmente, modo append (preserva IDs) ou replace
- Anexos físicos (`uploads/`) **não entram** no JSON — copie a pasta manualmente junto com o `.db`

---

## Estrutura do código

```
src/
├── App.tsx                    # roteador lazy + suspense + atalhos globais
├── lib/
│   ├── db.ts                  # carga do SQLite + singleton getDb()
│   ├── migrations.ts          # 18 migrations versionadas (v1→v18)
│   ├── backup.ts              # JSON export/import
│   ├── csv.ts                 # CSV por entidade
│   ├── search.ts              # busca global (12 tipos de entidade)
│   ├── format.ts              # datas, moeda, ratings (pt-BR)
│   ├── config.ts              # caminho do HD externo
│   ├── gcal.ts                # wrapper TS dos commands Rust (Google Calendar)
│   └── shortcuts.ts           # event bus Ctrl+N
├── components/
│   ├── ui/                    # primitivos (Button, Card, Dialog, Badge…)
│   ├── shared/                # ThemeToggle, CommandPalette
│   └── layout/                # Sidebar, AppLayout (+ WorkSessionWidget)
└── modules/
    ├── dashboard/             # DashboardPage
    ├── gigs/                  # GigsPage + forms + views + components
    ├── venues/
    ├── crm/
    ├── fans/
    ├── music/                 # MusicPage — Stage-Gate, Flow Sessions
    ├── classes/
    ├── content/
    ├── ideas/
    ├── parties/               # PartiesPage — produção de festas
    ├── insights/              # InsightsPage — v_insights VIEW
    ├── revisao/               # RevisaoPage — weekly review
    ├── foco/                  # FocoPage + WorkSessionWidget
    ├── objetivos/             # ObjetivosPage — OKRs
    ├── decisoes/              # DecisoesPage — Decision Log
    ├── identity/
    ├── tasks/
    ├── finance/               # FinancePage — único chunk com Recharts
    └── settings/

src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/default.json
└── src/
    ├── main.rs
    ├── lib.rs                 # plugins + commands Tauri
    ├── gcal.rs                # OAuth PKCE + Calendar API
    └── oauth_success.html
```

---

## Schema do banco (v18)

18 migrations versionadas, sempre aditivas, nunca destrutivas.

Tabelas principais: `contacts`, `venues`, `gigs`, `gig_debrief_drafts`, `tasks`, `subtasks`, `content`, `ideas`, `students`, `class_packages`, `student_packages`, `classes`, `artist_identity`, `artist_templates`, `parties`, `party_costs`, `music_projects`, `tracks`, `track_collaborators`, `track_flow_sessions`, `track_media_targets`, `music_project_costs`, `track_performance_snapshots`, `gig_tracks`, `finance_categories`, `finance_transactions`, `finance_recurring`, `equipment`, `work_sessions`, `highlights`, `okrs`, `decisions`, `app_settings`, `gcal_auth`

Views: `v_insights` (pool unificada de aprendizados de GIGs + tracks + festas + ideias)

---

## Princípios de design

O sistema aplica referenciais com base empírica, não modismos de produtividade:

- **Stage-Gate** (Cooper, 1986) — pipeline de inovação com gates decisórios objetivos
- **Constraint-based Creativity** (Stokes) — restrições explícitas aumentam produção criativa
- **Flow Theory** (Csikszentmihalyi) — equilíbrio desafio × habilidade
- **After-Action Review** (US Army) — debrief estruturado pós-evento
- **Energy Management** (Schwartz & McCarthy, HBR 2007) — gerenciar energia, não só tempo
- **Progress Principle** (Teresa Amabile, HBS) — visualizar progresso prediz motivação criativa
- **OKRs** (Andy Grove / John Doerr) — objetivos com key results mensuráveis
- **Decision Log** (Kahneman) — explicitar critérios de decisão reduz vieses sistemáticos
- **Lei de Goodhart** — métricas são bússolas, não termômetros
