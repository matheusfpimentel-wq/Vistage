# MusicGest

Sistema **local-first** de gestão para negócio musical (DJ, produtor, criador
de conteúdo). Banco SQLite portátil em HD externo, app desktop nativo
(Tauri 2) que roda em Mac e Windows.

> Status atual: **Fase 1 — Fundação** completa. Próximas fases (GIGs, CRM,
> Tarefas, Financeiro, Google Calendar, Dashboard, Build) na sequência.

## O que já está pronto (Fase 1)

- Projeto Tauri 2 + React 18 + Vite + TypeScript + Tailwind + estilo shadcn/ui
- Schema SQLite completo para **todos** os módulos (gigs, contatos, tarefas,
  financeiro, equipamentos, integração Google Calendar)
- Sistema de migrations versionadas (idempotentes) — `src/lib/migrations.ts`
- Tela de **setup inicial**: o usuário escolhe a pasta no HD externo, o app
  cria `musicgest.db`, `uploads/` e `musicgest.config.json` lá; nas próximas
  aberturas o app carrega tudo de volta
- Detecta HD desconectado e exibe mensagem clara
- Layout base com **sidebar** + roteamento (Dashboard, GIGs, CRM, Tarefas,
  Financeiro, Configurações) + **dark/light mode** com toggle

## Stack

- **Desktop:** Tauri 2 (Rust, ~10MB binário)
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, lucide-react
- **Banco:** SQLite via `@tauri-apps/plugin-sql`
- **Estado:** Zustand
- **Estrutura de pastas:** módulos isolados em `src/modules/<modulo>`,
  componentes reutilizáveis em `src/components/{ui,shared,layout}`

## Pré-requisitos

1. **Node.js** 18+ (recomendo 20+)
2. **Rust** (estável). Instale via <https://www.rust-lang.org/tools/install>.
3. **Toolchain de build nativo** do seu OS:
   - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
   - **Windows:** Microsoft C++ Build Tools (Visual Studio Installer →
     "Desktop development with C++") + WebView2 (já vem no Windows 11)

Depois disso:

```bash
npm install
```

## Desenvolvimento

```bash
npm run tauri:dev
```

Isso abre a janela do MusicGest. Na primeira vez você verá a tela de Setup —
escolha uma pasta (ex: `/Volumes/HD/musicgest` ou `E:\musicgest`) e o app
cria o banco automaticamente.

> Se quiser só rodar o frontend no navegador (sem Tauri), use `npm run dev` —
> mas as APIs nativas (fs, dialog, sql) **não funcionam** fora do Tauri.

## Ícones do app (necessário antes do primeiro build)

O Tauri precisa de ícones para gerar o `.app`/`.exe`. Gere a partir de
qualquer PNG quadrado (mínimo 1024x1024):

```bash
npm run tauri icon caminho/para/seu-icone.png
```

Isso popula `src-tauri/icons/` com todos os tamanhos/formatos. Sem isso, o
`npm run tauri:dev` funciona normalmente, mas `npm run tauri:build` falha.

## Build dos binários

```bash
# rode no SO de destino — não há cross-compile fácil em Tauri
npm run tauri:build
```

- **macOS:** gera `.app` e `.dmg` em `src-tauri/target/release/bundle/`
- **Windows:** gera `.exe` (instalador) e `.msi` no mesmo diretório

> Os binários precisam ser gerados na sua máquina Mac e/ou Windows — não há
> cross-compile fácil no Tauri. Na Fase 8 podemos configurar GitHub Actions
> para gerar binários automaticamente nos dois OSes.

### Portabilidade no HD externo

A ideia é que **app + dados** convivam no HD:

```
/Volumes/HD/musicgest/
├── musicgest.db              # banco SQLite
├── musicgest.config.json     # caminho do db + uploads + meta
└── uploads/                  # roteiros, banners, comprovantes
```

Você pode (opcionalmente) copiar os próprios executáveis (`.app` e `.exe`)
para o HD também — basta plugar em qualquer máquina, abrir o executável
correspondente, e o app encontra os dados sozinho usando o último
`musicgest.config.json` carregado. Se for um HD novo numa máquina nova,
use "Abrir banco existente" no setup e aponte para o `musicgest.config.json`.

## Estrutura

```
GM-/
├── src/
│   ├── App.tsx               # roteador + boot do banco
│   ├── main.tsx
│   ├── index.css             # tema Tailwind (light/dark)
│   ├── lib/
│   │   ├── db.ts             # carga do SQLite
│   │   ├── migrations.ts     # schema completo + migrations
│   │   ├── config.ts         # store de config (caminho do HD)
│   │   ├── theme.ts          # store de tema
│   │   └── utils.ts
│   ├── components/
│   │   ├── ui/               # primitivos (Button, Card, ...) estilo shadcn
│   │   ├── shared/           # ThemeToggle, etc.
│   │   └── layout/           # Sidebar, AppLayout
│   ├── pages/
│   │   └── Setup.tsx         # tela de primeira execução
│   └── modules/              # um diretório por módulo do sistema
│       ├── dashboard/
│       ├── gigs/
│       ├── crm/
│       ├── tasks/
│       ├── finance/
│       └── settings/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/{main.rs, lib.rs}
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Próximas fases

- **Fase 2 — GIGs:** CRUD completo, debrief automático ao concluir, avaliações
  (carisma/técnica/repertório), estatísticas
- **Fase 3 — CRM:** contatos com histórico de interações vinculado a GIGs
- **Fase 4 — Tarefas:** com sugestões automáticas por GIG
- **Fase 5 — Financeiro:** categorias customizáveis, dashboard, patrimônio,
  recorrentes
- **Fase 6 — Google Calendar:** OAuth 2.0 + sync bidirecional
- **Fase 7 — Dashboard + polimento:** busca global, atalhos, backup/import
- **Fase 8 — Builds cross-platform**
