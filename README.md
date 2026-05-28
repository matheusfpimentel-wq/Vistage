# MusicGest

Sistema **local-first** de gestão para negócio musical (DJ, produtor, criador
de conteúdo). Banco SQLite portátil em HD externo, app desktop nativo
(Tauri 2) que roda em Mac e Windows. Todas as 7 fases funcionais
implementadas.

## Funcionalidades

### Dashboard
- KPIs: saldo do mês, total de GIGs, avaliação média, debriefs pendentes
- Alerta destacado quando há GIGs com debrief pendente (linkado pro módulo)
- Próximas 3 GIGs e tarefas vencendo nos próximos 7 dias
- Atualização automática ao trocar entre módulos

### Gestor de GIGs
- CRUD completo com formulário em abas (Pré-evento · Logística/Financeiro)
- 4 visualizações: Lista (filtros), Calendário (mês), Kanban (por status),
  Insights (KPIs, top venues, evolução por mês)
- Status: Proposta · Confirmada · A Caminho · Concluída · Cancelada
- Vínculo com promoter do CRM
- **Modal automático de Debrief** ao mudar status pra Concluída:
  - 3 abas: Aprendizados · Avaliações · Outros
  - Validação rigorosa: não fecha sem pontos fortes/fracos/aprendizados +
    avaliações de carisma, técnica e repertório (0–5 com passo 0.5 + nota)
  - Autosave de rascunho a cada 1.5s (não perde texto se fechar sem querer)
  - Opção "salvar como pendente" pra terminar depois
  - Tag "Debrief pendente" no dashboard e na lista
- Sugestão automática de tarefas-padrão pra GIGs futuras (6 templates com
  offsets em relação à data da GIG)
- Auto-vínculo financeiro: marcar GIG como "Pago integralmente" cria
  receita na categoria DJ vinculada (idempotente)

### CRM (Contatos)
- 6 tipos pré-definidos (Cliente, Casa, Booker, Produtor, Colaborador,
  Fornecedor) — multi-select
- Tags livres adicionáveis em runtime
- Avaliação interna em estrelas (1–5)
- Painel de detalhe com estatísticas computadas (# GIGs, R$ já gerado,
  última GIG) + abas com GIGs vinculadas e histórico de interações
- Adicionar/remover interações datadas; `last_interaction_at` atualiza
  automaticamente
- Botão "Nova GIG com este contato" pré-preenche o GigForm

### Tarefas
- Categorias (GIG · Produção Musical · Conteúdo · Administrativo · Pessoal)
- Prioridade (Baixa/Média/Alta/Urgente), status, vencimento
- Vínculo opcional com GIG ou contato
- Subtarefas com checklist (checkbox + rename inline)
- Filtros chip: Todas · Hoje · Esta semana · Atrasadas · Sem data
- Tarefas atrasadas destacadas em vermelho
- Lista e Kanban
- **Sugestão automática ao criar GIG futura**: 6 templates com offsets
  (dados bancários −7d, setlist −5d, confirmar contato −3d, equipamento
  −1d, agradecimento +1d, mídia +2d)

### Financeiro
- CRUD de entradas e saídas com status (Previsto/Pago), forma de pagamento,
  tipo Fixa/Variável, marcador "imposto", vínculo opcional com GIG ou contato
- **Categorias customizáveis** (20 padrão pré-cadastradas) com gerenciador
  que renomeia/exclui (aviso quando em uso); "+ Nova categoria" inline no
  select também
- Dashboard com Recharts: KPIs mês/ano, gráfico de barras receitas vs
  despesas 12 meses, pizzas por categoria, top 5 GIGs mais lucrativas,
  projeção 30 dias, despesas fixas mensais
- **Patrimônio** auto-derivado das despesas com categoria "Equipamentos"
  (Em uso/Vendido/Quebrado/Estoque)
- **Recorrentes**: modelos mensais + botão "Gerar do mês" (idempotente)

### Google Calendar (Fase 6)
- OAuth 2.0 com PKCE via servidor loopback temporário no Rust
- Sincronização bidirecional manual
- Auto-push ao salvar/editar GIG, auto-delete ao excluir
- Eventos novos do calendário viram GIGs em "Proposta" no pull
- Refresh token automático
- Setup guiado com passo a passo do Google Cloud Console (ver mais abaixo)

### Polimento (Fase 7)
- **Busca global Ctrl/Cmd + K**: pesquisa em paralelo em GIGs, contatos,
  tarefas e financeiro; resultados agrupados; setas + Enter pra navegar
- **Atalho Ctrl/Cmd + N**: cria item novo no módulo ativo
- **Backup completo**: export JSON com todas as 12 tabelas; import com
  confirmação dupla e transação atômica

## Stack

- **Desktop:** Tauri 2 (Rust, ~10MB binário)
- **Frontend:** React 18, Vite, TypeScript, Tailwind, shadcn-style primitives
- **Charts:** Recharts (lazy-loaded — só carrega no módulo Financeiro)
- **Banco:** SQLite via `@tauri-apps/plugin-sql`
- **Estado:** Zustand
- **Datas:** date-fns + locale ptBR
- **Toasts:** sonner
- **OAuth:** PKCE puro em Rust (`tiny_http` + `ureq` + `sha2`)

## Pré-requisitos

1. **Node.js** 18+ (recomendo 20+)
2. **Rust** estável (<https://rustup.rs>)
3. Toolchain nativo do OS:
   - **macOS:** Xcode CLI (`xcode-select --install`)
   - **Windows:** Microsoft C++ Build Tools + WebView2 (já vem no Win 11)

```bash
npm install
```

## Desenvolvimento

```bash
npm run tauri:dev
```

Na primeira execução, a tela de Setup pede para você escolher uma pasta no HD
externo (ex: `/Volumes/HD/musicgest` no Mac, `E:\musicgest` no Windows).
O app cria `musicgest.db`, `uploads/` e `musicgest.config.json` lá.

Depois, em **Configurações** vai aparecer um botão **"Popular com exemplos"**
oferecendo dados de exemplo (4 GIGs em estados diferentes, contatos, tarefas
e transações) — útil pra você ver o sistema funcionando rápido.

## Build dos instaladores

### Opção A (recomendada): GitHub Actions builda pra você

A cada push, `.github/workflows/build.yml` builda Mac e Windows nos servidores
do GitHub. Para baixar:

1. Abra <https://github.com/matheusfpimentel-wq/GM-/actions>
2. Clique no workflow mais recente (verde)
3. Role até **Artifacts** e baixe `musicgest-macos-latest` (`.dmg`) e/ou
   `musicgest-windows-latest` (`.msi` e `.exe`)

### Opção B: buildar localmente

```bash
npm run tauri:build
```

Saída em `src-tauri/target/release/bundle/`. Tauri **não faz cross-compile**:
só gera `.app` rodando em Mac, só gera `.exe` rodando em Windows.

> **Sobre assinatura:** o binário não é assinado. Mac vai pedir clique direito
> → Abrir; Windows vai mostrar SmartScreen "Mais informações → Executar
> mesmo assim". Pra distribuir publicamente, considere certificados (Apple
> Developer $99/ano, Windows EV ~$400/ano).

### Ícones

Já tem um ícone placeholder (nota musical em fundo roxo). Pra trocar:

```bash
npm run tauri icon scripts/musicgest-icon.png
```

## Portabilidade no HD externo

```
/Volumes/HD/musicgest/
├── musicgest.db              # banco SQLite
├── musicgest.config.json     # caminho do db + uploads + meta
└── uploads/                  # anexos (vazia por enquanto)
```

Plugue o HD em qualquer máquina, abra o executável correspondente
(`.app` no Mac, `.exe` no Windows), e o app encontra os dados sozinho via
último `musicgest.config.json` carregado. Se for HD novo numa máquina nova,
use "Abrir banco existente" no setup e aponte para o `musicgest.config.json`.

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
6. No MusicGest → **Configurações** → cole esses dois valores no card
   "Google Calendar", clique em **Salvar credenciais** e depois em
   **Conectar Google Calendar**.
7. Uma janela do navegador abre — autorize o acesso. O app recebe
   o callback automaticamente em `127.0.0.1:<porta-aleatória>`.
8. Escolha qual calendário receberá as GIGs (recomendado criar um
   calendário dedicado tipo "GIGs" no Google Calendar antes).
9. Use **Sincronizar agora** para fazer um sync manual. A partir daí,
   toda criação/edição de GIG empurra automaticamente o evento.

> Os tokens ficam salvos só no `musicgest.db` no seu HD — nada vai pra
> servidor nenhum nosso. O `Client secret` de Desktop app não é realmente
> secreto (modelo do Google pra apps instalados).

## Estrutura do código

```
GM-/
├── src/
│   ├── App.tsx               # roteador + atalhos globais + suspense
│   ├── main.tsx
│   ├── index.css
│   ├── lib/
│   │   ├── db.ts             # carga do SQLite
│   │   ├── migrations.ts     # schema completo (12 tabelas)
│   │   ├── config.ts         # caminho do HD
│   │   ├── theme.ts          # light/dark
│   │   ├── format.ts         # datas, moeda, ratings em pt-BR
│   │   ├── gcal.ts           # wrapper TS dos commands Rust
│   │   ├── backup.ts         # export/import JSON
│   │   ├── search.ts         # busca global
│   │   ├── seed.ts           # dados de exemplo
│   │   ├── shortcuts.ts      # event bus Ctrl+N
│   │   └── utils.ts
│   ├── components/
│   │   ├── ui/               # primitivos (Button, Card, Dialog, ...)
│   │   ├── shared/           # ThemeToggle, CommandPalette
│   │   └── layout/           # Sidebar, AppLayout
│   ├── pages/
│   │   └── Setup.tsx
│   └── modules/              # cada módulo isolado
│       ├── dashboard/
│       ├── gigs/             # tipos, api, forms, views, components
│       ├── crm/
│       ├── tasks/
│       ├── finance/
│       └── settings/         # config, Google Calendar, backup, seed
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs            # registra plugins + commands
│       ├── gcal.rs           # OAuth + Calendar API
│       └── oauth_success.html
├── .github/workflows/build.yml
├── scripts/
│   ├── make_icon.py
│   └── musicgest-icon.png
└── package.json
```

## Próximos passos possíveis (futuro)

Coisas que não foram entregues nas 7 fases mas que valeria no futuro:

- Upload de roteiros, banners e comprovantes (preparado no schema, falta UI)
- Sync periódico automático com Google Calendar em background
- Resolução interativa de conflitos (diff side-by-side)
- Meta mensal de receita com indicador visual
- Export de relatório financeiro em CSV pro contador
- Análise agregada de aprendizados (NLP simples nos campos do debrief)
