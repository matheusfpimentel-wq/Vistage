# Vistage Mobile — controle remoto "em qualquer lugar"

Companion mobile (**PWA**) pra consulta rápida, registro de atividade/foco e
notas — funcionando **com o desktop desligado**. O desktop continua local-first;
pra nuvem sobe só um **espelho mínimo**.

## Decisões (definidas com o usuário)

| Tema | Escolha |
|---|---|
| Alcance | Em qualquer lugar (PC pode estar desligado) → exige nuvem |
| Formato | **PWA** instalável (sem loja, sem custo de conta dev) |
| Nuvem | Supabase (Postgres + Auth + API REST, plano grátis) |
| Consultas no celular | Agenda próxima · Resumo financeiro (só saldo) · Contato do dia · Métricas de foco |
| Escrita do celular | Atividade (work session) · Nota/destaque (highlight) · Tarefa |
| Privacidade | Finanças **detalhadas nunca sobem**; o resto do app fica local |
| Conta / acesso | **Uma conta por DJ/arquivo**; a mesma conta abre em **vários aparelhos** |

## Arquitetura

```
   DESKTOP (local-first, Tauri)                 NUVEM (Supabase)            CELULAR (PWA)
   ┌───────────────────────────┐                ┌──────────────┐           ┌──────────────┐
   │ SQLite local (.vistage)   │  push (ureq)   │ agenda_mirror│   read    │ Hoje         │
   │  gigs/classes/tasks  ─────────────────────▶│ finance_summ.│──────────▶│ (consultas)  │
   │  finance (saldo só)       │                │ contact_today│           │              │
   │  work_sessions/highlights │                │ focus_metrics│           │ Foco (timer) │
   │                           │  pull+ingest   │              │   write   │ Capturar     │
   │  ingere capturas      ◀────────────────────│ capture_inbox│◀──────────│ (atividade/  │
   └───────────────────────────┘                └──────────────┘           │  nota/tarefa)│
                                                  RLS por auth.uid()        └──────────────┘
```

- **Push (desktop → nuvem):** a cada mudança/intervalo, o desktop recalcula e dá
  UPSERT nas 4 tabelas de leitura (idempotente por `source_id`/`month`/`week`).
- **Pull (nuvem → desktop):** o desktop lê `capture_inbox where consumed_at is null`,
  cria `work_session` / `highlight` / `task` no banco local e marca `consumed_at`.
- **Celular:** lê as 4 tabelas (consultas) e insere em `capture_inbox`. Timer de
  foco roda local no PWA; ao terminar, vira uma captura `kind='session'`.

O contrato (tabelas + RLS) está em [`supabase/schema.sql`](../supabase/schema.sql).

## O que alimenta cada tabela

| Tabela | Fonte no desktop |
|---|---|
| `agenda_mirror` | próximas `gigs`, `classes`, `tasks` (título, horário, local) |
| `finance_summary` | saldo do mês e a receber — **só os números** |
| `contact_today` | follow-ups do CRM com vencimento hoje (nome + motivo + contato) |
| `focus_metrics` | `work_sessions` da semana agregadas por atividade |
| `capture_inbox` | (entrada) capturas feitas no celular |
| `sync_state` | contador `rev` por conta (trigger) — detecção barata de mudança |

## Conta, acesso e multi-dispositivo

**Uma conta por DJ/arquivo.** Cada `.vistage` corresponde a uma conta Supabase
(e-mail + senha ou magic link). Toda linha na nuvem carrega `user_id`, e o **RLS**
(`user_id = auth.uid()`) garante que cada conta vê **só a base dela** — é esse
isolamento que torna o app distribuível: cada DJ é uma conta independente; uma
agência apenas distribui contas (sem precisar de um modelo de "vaults").

**Vários aparelhos, mesma conta.** Multi-dispositivo é **nativo do Supabase Auth**:
celular, notebook e um segundo aparelho logam na mesma conta e enxergam a mesma
base, sem tabela extra. O desktop guarda o refresh token (em `app_settings`, fora
do backup) pra sincronizar sem relogar.

## Detecção de mudança (o "ETag" da nuvem)

`sync_state` tem **um contador `rev` por conta**, incrementado por trigger a cada
mudança. Cada lado guarda localmente o último `rev` visto e só puxa o delta quando
o `rev` da nuvem é maior — ler **uma linha** já responde "mudou algo?". As duas
direções:

- **Celular → desktop:** ao abrir o notebook, ele vê `capture_inbox` com
  `consumed_at IS NULL` (índice dedicado) → avisa *"o celular registrou X"*, ingere
  e marca consumido.
- **Desktop → celular:** o app compara o `rev` e busca as linhas do espelho com
  `updated_at` mais novo que o cursor. Com **Realtime** (websocket) o aviso é
  instantâneo; sem ele, um poll ao abrir resolve.

## Fases

- [x] **Fase 0 — contrato:** schema da nuvem + RLS + este doc.
- [x] **Fase 1 — provisionar:** schema aplicado no projeto Supabase (`opvctbxzlwpyrvutfazb`).
- [x] **Fase 2 — desktop sync:** push das 4 tabelas + pull/ingest da caixa, com
      painel em Configurações (login email/senha, sincronizar, status). Config
      pública embutida — sem colar nada.
- [x] **Fase 3 — PWA:** app em `mobile/` (Hoje / Foco / Capturar) + login + service
      worker/manifest + workflow de deploy no GitHub Pages.

## O que o usuário precisa fazer

1. Criar a **conta de login** (uma por DJ/arquivo): painel Supabase →
   *Authentication → Users → Add user* (email + senha, marcar *Auto Confirm User*).
2. Ativar o **GitHub Pages**: *Settings → Pages → Source = GitHub Actions*. O
   workflow `deploy-pwa.yml` publica o `mobile/` quando a `main` recebe o merge.
3. No **desktop**: Configurações → Integrações → Sincronização mobile → logar →
   *Sincronizar agora*.
4. No **celular**: abrir a URL do Pages → *Adicionar à tela inicial* → logar na
   mesma conta.

> Free tier do Supabase pausa após ~1 semana sem uso (reativa num clique) e tem
> limite de tamanho — folgado pra esse espelho.
