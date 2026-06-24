# Vistage

Sistema **local-first** de gestão para negócio musical (DJ, produtor, criador de conteúdo). App desktop nativo em **Tauri 2** (Mac e Windows) com banco **SQLite**, onde todos os seus dados vivem num único arquivo portátil `.vistage` — como um documento do Office, mas para a sua carreira.

---

## Como o Vistage guarda seus dados

O Vistage funciona como um **editor de documentos**:

- Seus dados vivem num arquivo **`.vistage`** que você **Abre** e **Salva** (`Ctrl/Cmd + S`).
- Esse arquivo carrega **tudo junto**: todas as tabelas + os **anexos embutidos** (fotos, flyers, roteiros, manual de marca, PDFs) + os tokens das integrações + a sessão de sincronização. Você leva o `.vistage` para outra máquina e abre — está tudo lá, fotos inclusive.
- O arquivo pode ser **protegido por senha** (AES‑GCM 256 + PBKDF2). Sem a senha, não abre — e não há recuperação (é o ponto).

### Formato do arquivo (contêiner)

Para continuar sendo **um arquivo só** sem estourar a memória ao salvar bibliotecas grandes de mídia, o `.vistage` é um **contêiner**:

```
.vistage
├── vistage.json     ← todos os dados (sem base64)
└── files/           ← bytes crus de cada anexo
```

- **Sem senha** → zip puro (assinatura `PK`).
- **Com senha** → o mesmo zip cifrado num envelope binário `VENC` (AES‑GCM).
- **Compatível com versões antigas:** arquivos `.vistage` no formato JSON antigo (com ou sem senha) continuam abrindo e **migram sozinhos** para o contêiner no próximo *Salvar*. A detecção é automática pela assinatura do arquivo.

> Converter um `.vistage` antigo offline (opcional): `node scripts/vistage-to-container.mjs <arquivo.vistage> [--password <senha>]`.

### Onde ficam os arquivos em disco

```
<pasta escolhida no Setup>/
├── vistage.config.json   # aponta para a pasta de anexos
└── uploads/              # anexos físicos (fotos, PDFs, vídeos)
```

O banco SQLite **ativo** é uma réplica local no diretório de dados do app (`AppData`/`Application Support`), reconstruída a partir do `.vistage` que você abre. A fonte da verdade é sempre o seu arquivo `.vistage`.

---

## Funcionalidades (visão geral)

| Módulo | Rota | Resumo |
|---|---|---|
| **Dashboard** | `/` | KPIs estratégicos + sub-painéis (Relacionamento, Criação, Gestão), timeline semanal integrada |
| **Hoje / Relatório / Mapa** | `/hoje` `/relatorio` `/mapa` | Foco do dia, relatório mensal e mapa mental |
| **Alertas** | `/alertas` | Regras de alerta/insight em editor composto **SE / ENTÃO** (E/OU), seguras por whitelist |
| **GIGs** | `/gigs` | CRUD + views (lista/calendário/kanban/insights), debrief com avaliação, checklist, set list N:N com tracks |
| **Venues** | `/venues` | CRUD, foto, DJs residentes, KPIs por venue |
| **Pessoas** | `/pessoas` | CRM unificado: contatos, fornecedores, histórico de interações, vínculo com GIGs/tarefas |
| **Clube de fãs** | `/fas` | Níveis de fã, presença em GIGs, interações |
| **Produção Musical** | `/musica` | Stage‑Gate (etapas + gates), Stand‑by, Flow Sessions, heatmap, roadmap, analytics, sub-blocos Marketing/Financeiro/Performance |
| **Aulas** | `/aulas` | Alunos, pacotes com ementa, sessões com saldo |
| **Festas** | `/festas` | CRUD de festas, lineup N:N, custos inline, auto-tarefas ao confirmar, KPIs |
| **Conteúdo** | `/conteudo` | Pipeline editorial (lista/calendário/kanban), métricas |
| **Banco de Ideias** | `/ideias` | Captura rápida `Ctrl+I`, Brain Dump, conversão para Track/Tarefa, provocações (InsightDie) |
| **Insights** | `/insights` | Pool unificada (GIGs + tracks + festas + ideias), busca full-text, exportar TXT |
| **Energia & Foco** | `/foco` | 3 abas: **Trilha da Semana**, **Modo Foco** (streak, hora de pico), **Highlights** |
| **OKRs** | `/objetivos` | Objetivos trimestrais com key results e auto‑pull de métricas |
| **Identidade Artística** | `/identidade` | Bio, paleta de cores, redes, logo/presskit, galeria, fontes da marca |
| **Tarefas** | `/tarefas` | Lista + Kanban + Eisenhower (drag-and-drop), subtarefas, recorrência |
| **Reuniões** | `/reunioes` | Reuniões vinculadas a tarefas |
| **Financeiro** | `/financeiro` | Dashboard Recharts, transações, recorrentes, patrimônio derivado de equipamentos |
| **Carreira (Wrapped)** | `/carreira` | Retrospectiva da carreira |
| **Configurações** | `/configuracoes` | Documento, integrações, exportações, atalhos, regras, aparência |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Desktop | Tauri 2 (Rust) |
| Frontend | React 18 + Vite + TypeScript strict + Tailwind |
| Componentes | shadcn/ui style (Radix primitives) |
| Charts | Recharts (lazy — só no Financeiro) |
| Banco | SQLite via `@tauri-apps/plugin-sql` (libsql) |
| Estado | Zustand |
| Datas | date-fns + locale ptBR |
| Drag-and-drop | `@dnd-kit` |
| Compressão | `fflate` (contêiner `.vistage`) |
| Criptografia | Web Crypto (AES‑GCM 256 + PBKDF2‑SHA256) |
| OAuth | PKCE puro em Rust (`tiny_http` + `ureq` + `sha2`) |

---

## Integrações

| Integração | O que faz |
|---|---|
| **Google Calendar** | Sincroniza GIGs com um calendário Google (OAuth PKCE via Rust; tokens viajam no `.vistage`) |
| **Todoist** | Espelha tarefas |
| **Notion** | Espelha o Banco de Ideias (cria base de dados e páginas automaticamente) |
| **Sincronização (Supabase)** | Sessão portátil embutida no `.vistage` reconecta o mesmo usuário em outra máquina |
| **Celular (PWA)** | Companion mobile (`mobile/`) para captura rápida que espelha de volta no app |

> Em estudo: integração com **Google Drive** apenas para fotos/vídeos (seleção de pastas), reaproveitando o OAuth do Calendar — tira a mídia pesada de dentro do documento.

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
npm run tauri:dev      # app desktop (Rust + Vite)
npm run dev            # só o frontend (web), sem Tauri
npm run build          # tsc --noEmit && vite build (checagem de tipos + bundle)
```

Na primeira execução, o Setup pede uma pasta para os anexos e cria `vistage.config.json` + `uploads/` ali. Em **Configurações → Popular com exemplos** você gera dados de demo para ver o sistema funcionando.

---

## Build dos instaladores

### Opção A (recomendada): GitHub Actions

A cada push, `.github/workflows/build.yml` builda Mac e Windows. Baixe os artefatos (`.dmg` / `.msi`/`.exe`) na aba **Actions** do repositório, no run mais recente.

### Opção B: local

```bash
npm run tauri:build
```

Saída em `src-tauri/target/release/bundle/`. Tauri não faz cross-compile: Mac produz `.app`/`.dmg`, Windows produz `.exe`/`.msi`.

> **Assinatura ad-hoc** no macOS (abre sem o erro "danificado" em Apple Silicon; não é certificado pago). Primeira abertura: clique direito → Abrir. Windows: SmartScreen → "Mais informações → Executar mesmo assim".
>
> Se um `.dmg` antigo disser "danificado": `sudo xattr -rd com.apple.quarantine /Applications/Vistage.app`

---

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl/Cmd + S` | Salvar o documento |
| `Ctrl/Cmd + K` | Busca global |
| `Ctrl/Cmd + N` | Novo item no módulo ativo |
| `Ctrl + I` | Captura rápida de ideia |
| `Ctrl + Shift + F` | Modo Foco Profundo (oculta sidebar) |

Customizáveis em **Configurações → Atalhos**.

---

## Backup e exportação

- **Documento `.vistage`** — é o backup completo e portátil: dados + anexos embutidos + sessões. Use *Salvar como* para snapshots datados.
- **JSON / CSV** (Configurações) — exportações pontuais por entidade.
- O `.vistage` carrega **credenciais** (tokens das integrações, sessão de sync) em texto — por isso a UI avisa "não compartilhe". Para blindar, **proteja o documento com senha**.

---

## Estrutura do código

```
src/
├── App.tsx                    # boot "abre em branco" + roteador lazy + atalhos
├── lib/
│   ├── db.ts                  # SQLite (réplica local) + singleton getDb()
│   ├── migrations.ts          # migrations versionadas (v1 → v132), sempre aditivas
│   ├── document.ts            # store do documento .vistage (Abrir/Salvar/Salvar como)
│   ├── backup.ts              # contêiner .vistage: empacota/lê dados + anexos
│   ├── crypto.ts              # criptografia opcional (envelope string + binário "VENC")
│   ├── config.ts              # pasta de anexos (uploadsDir) + vistage.config.json
│   ├── uploads.ts             # cópia/carga de anexos, useImageUrl
│   ├── gcal.ts                # wrapper TS dos commands Rust (Google Calendar)
│   ├── todoist.ts notion.ts supabase.ts mobileSync.ts integrationsSync.ts
│   └── shortcuts.ts           # atalhos globais
├── components/                # ui/ (primitivos), shared/, layout/ (dock, AppLayout)
└── modules/                   # um diretório por módulo (gigs, music, pessoas, foco, …)

src-tauri/
└── src/
    ├── lib.rs                 # plugins + commands Tauri
    ├── db.rs                  # acesso ao SQLite
    ├── gcal.rs                # OAuth PKCE + chamadas Google (via ureq, evita CORS)
    └── oauth_success.html

scripts/vistage-to-container.mjs   # conversor offline JSON→contêiner (com --password)
mobile/                            # PWA companion de captura
docs/                              # roadmap mobile, sync, cloud-push
```

---

## Schema do banco

Migrations versionadas em `src/lib/migrations.ts` (**até v132**), sempre **aditivas, nunca destrutivas** — o app aplica as pendentes no boot, de forma idempotente.

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
