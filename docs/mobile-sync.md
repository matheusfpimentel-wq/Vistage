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

## Autenticação

Single-user, **e-mail magic link** do Supabase. Desktop e celular logam no mesmo
usuário; o RLS (`user_id = auth.uid()`) garante que só esse usuário lê/escreve.
O desktop guarda o refresh token (em `app_settings`, tabela de máquina, fora do
backup) pra sincronizar sem relogar.

## Fases

- [x] **Fase 0 — contrato:** schema da nuvem + RLS + este doc.
- [ ] **Fase 1 — provisionar:** aplicar o schema no projeto Supabase do usuário.
- [ ] **Fase 2 — desktop sync:** módulo de push (4 tabelas) + pull/ingest da caixa,
      painel em Configurações (colar URL + anon key, login, status).
- [ ] **Fase 3 — PWA:** telas Hoje / Foco / Capturar + auth + deploy (GitHub Pages).

## O que o usuário precisa fazer

1. Criar conta no **Supabase** → *New project* (grátis, região São Paulo); guardar
   a senha do banco.
2. Enviar **Project URL** + **anon/public key** (nunca a `service_role`).
3. Ativar **GitHub Pages** no repo (deploy do PWA — workflow vem pronto).
4. No celular: abrir a URL → *Adicionar à tela inicial*. No desktop: colar URL+key
   uma vez e logar.

> Free tier do Supabase pausa após ~1 semana sem uso (reativa num clique) e tem
> limite de tamanho — folgado pra esse espelho.
