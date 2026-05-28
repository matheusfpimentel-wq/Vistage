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

## Ícones do app

Já tem um ícone placeholder configurado (nota musical em fundo roxo escuro).
Os arquivos finais (todos os tamanhos, `.icns` para Mac, `.ico` para Windows)
estão em `src-tauri/icons/`. O PNG fonte está em `scripts/musicgest-icon.png`.

Quando você tiver um logo definitivo, substitua o PNG e regenere os ícones:

```bash
npm run tauri icon scripts/musicgest-icon.png
```

## Build dos binários — duas opções

### Opção A (fácil): GitHub Actions builda pra você

A cada `git push` para a branch, o workflow `.github/workflows/build.yml`
roda **automaticamente** nos servidores do GitHub (um Mac + um Windows) e
gera os instaladores. Para baixar:

1. Abra <https://github.com/matheusfpimentel-wq/GM-/actions>
2. Clique no workflow mais recente (deve estar verde)
3. Role até o final da página → seção **Artifacts**
4. Baixe `musicgest-macos-latest` (contém `.dmg`) e/ou
   `musicgest-windows-latest` (contém `.msi` e `.exe`)

Você não precisa instalar Rust nem nada na sua máquina pra isso.

### Opção B: buildar localmente

Precisa instalar uma vez:

- **macOS:** Xcode CLI (`xcode-select --install`) e Rust
  (<https://rustup.rs>)
- **Windows:** Microsoft C++ Build Tools (Visual Studio Installer → "Desktop
  development with C++") e Rust (<https://rustup.rs>)

Depois, na pasta do projeto:

```bash
npm run tauri:build
```

Saída: `src-tauri/target/release/bundle/` (`.dmg` no Mac, `.msi`+`.exe` no Windows).

> O Tauri **não faz cross-compile**: só gera `.app` rodando em Mac, só gera
> `.exe` rodando em Windows. Por isso a Opção A é mais prática.

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

## Integração com Google Calendar

A app sincroniza suas GIGs com um calendário do Google. Para configurar:

1. Acesse o **Google Cloud Console**:
   <https://console.cloud.google.com/apis/credentials>
2. Crie um projeto novo (ou use um existente).
3. Em **APIs &amp; Services → Library**, ative a **Google Calendar API**.
4. Em **APIs &amp; Services → OAuth consent screen**:
   - Tipo de usuário: **External**
   - Preencha nome do app, e-mail de contato, e adicione o seu próprio
     e-mail como **Test user** (enquanto o projeto está em modo Testing,
     só Test users podem autorizar)
5. Em **APIs &amp; Services → Credentials → Create credentials → OAuth client ID**:
   - Tipo: **Desktop app**
   - Copie o **Client ID** e o **Client secret** que aparecem
6. Abra o MusicGest → **Configurações** → cole esses dois valores no card
   "Google Calendar", clique em **Salvar credenciais** e depois em
   **Conectar Google Calendar**.
7. Uma janela do navegador padrão abre — autorize o acesso. O app recebe
   o callback automaticamente em `127.0.0.1:<porta-aleatória>`.
8. De volta no MusicGest, escolha qual calendário receberá as GIGs
   (recomendado criar um calendário dedicado tipo "GIGs" no Google
   Calendar antes — fica fora da sua agenda pessoal).
9. Use **Sincronizar agora** para fazer um sync manual. A partir daí,
   toda criação/edição de GIG no MusicGest empurra automaticamente o
   evento para o GCal.

> Os tokens ficam salvos só no `musicgest.db` (no seu HD) — nada vai pra
> servidor nenhum nosso. O `Client secret` de Desktop app não é realmente
> secreto (qualquer um que descompila o app pode lê-lo — esse é o modelo
> de "Installed Applications" do Google).

## Próximas fases

- **Fase 7 — Dashboard + polimento:** busca global, atalhos, backup/import
- **Fase 8 — Builds cross-platform**
