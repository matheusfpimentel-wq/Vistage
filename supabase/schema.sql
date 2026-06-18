-- ============================================================================
-- Vistage · sincronização mobile — espelho MÍNIMO na nuvem (Supabase / Postgres)
-- ============================================================================
-- Este é o CONTRATO entre o app desktop (local-first) e o PWA do celular.
--
-- Princípios de privacidade:
--   • O banco principal continua 100% LOCAL no desktop (arquivo .vistage).
--   • Pra nuvem sobe só um ESPELHO do que o usuário liberou.
--   • Finanças DETALHADAS nunca sobem — no máximo um resumo (saldo / a receber).
--
-- Modelo single-user: cada linha carrega user_id = auth.uid() e o RLS restringe
-- tudo ao dono. O desktop e o celular logam no MESMO usuário (e-mail magic link).
--
-- Idempotência: as tabelas de leitura usam (user_id, source, source_id) pra
-- UPSERT; a caixa de entrada usa client_ref pra não duplicar capturas.
--
-- Aplicar: via Supabase MCP (apply_migration) ou `supabase db push`. O script é
-- re-executável (drop policy if exists + create table if not exists).
-- ============================================================================

-- ── Leitura: agenda próxima (gigs / aulas / tarefas) ────────────────────────
create table if not exists public.agenda_mirror (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source      text not null,                       -- 'gig' | 'class' | 'task'
  source_id   text not null,                       -- id local (upsert idempotente)
  title       text not null,
  start_at    timestamptz,
  end_at      timestamptz,
  location    text,
  meta        jsonb not null default '{}'::jsonb,  -- contato, cachê (não-sensível), etc.
  updated_at  timestamptz not null default now(),
  unique (user_id, source, source_id)
);

-- ── Leitura: resumo financeiro (só números, sem lançamentos) ────────────────
create table if not exists public.finance_summary (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month       text not null,                       -- 'YYYY-MM'
  balance     numeric not null default 0,          -- saldo do mês
  to_receive  numeric not null default 0,          -- a receber (previsto)
  updated_at  timestamptz not null default now(),
  primary key (user_id, month)
);

-- ── Leitura: contato do dia (follow-up do CRM) ──────────────────────────────
create table if not exists public.contact_today (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id   text not null,
  name        text not null,
  reason      text,                                -- motivo do follow-up
  handle      text,                                -- telefone/@ pra abrir conversa
  due_date    date,
  updated_at  timestamptz not null default now(),
  unique (user_id, source_id)
);

-- ── Leitura: métricas de foco da semana ─────────────────────────────────────
create table if not exists public.focus_metrics (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week        text not null,                       -- 'YYYY-Www'
  payload     jsonb not null default '{}'::jsonb,  -- min por atividade, energia/foco médios
  updated_at  timestamptz not null default now(),
  primary key (user_id, week)
);

-- ── Escrita: caixa de captura (celular → desktop) ───────────────────────────
-- O celular insere; o desktop puxa o que está consumed_at IS NULL, ingere no
-- banco local (work_session / highlight / task) e marca consumed_at.
create table if not exists public.capture_inbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,                       -- 'session' | 'highlight' | 'task' | 'note'
  payload     jsonb not null,                      -- corpo da captura
  client_ref  text,                                -- id gerado no celular (idempotência)
  created_at  timestamptz not null default now(),
  consumed_at timestamptz,
  unique (user_id, client_ref)
);

-- ── Detecção de mudança barata (o "ETag" da nuvem) ──────────────────────────
-- Um contador `rev` por conta; um trigger incrementa a cada mudança nas tabelas
-- acima. O app guarda localmente o último `rev` que viu e só puxa o delta quando
-- o `rev` da nuvem for maior — uma linha minúscula responde "mudou algo?".
create table if not exists public.sync_state (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  rev         bigint not null default 0,
  updated_at  timestamptz not null default now()
);

-- ── Índices de leitura ──────────────────────────────────────────────────────
create index if not exists idx_agenda_user_start on public.agenda_mirror (user_id, start_at);
create index if not exists idx_contact_user_due  on public.contact_today (user_id, due_date);
create index if not exists idx_inbox_unconsumed  on public.capture_inbox (user_id, consumed_at)
  where consumed_at is null;

-- ── Row Level Security: cada um só vê/edita as próprias linhas ───────────────
alter table public.agenda_mirror   enable row level security;
alter table public.finance_summary enable row level security;
alter table public.contact_today   enable row level security;
alter table public.focus_metrics   enable row level security;
alter table public.capture_inbox   enable row level security;

drop policy if exists "own rows" on public.agenda_mirror;
drop policy if exists "own rows" on public.finance_summary;
drop policy if exists "own rows" on public.contact_today;
drop policy if exists "own rows" on public.focus_metrics;
drop policy if exists "own rows" on public.capture_inbox;

create policy "own rows" on public.agenda_mirror
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.finance_summary
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.contact_today
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.focus_metrics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.capture_inbox
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.sync_state enable row level security;
drop policy if exists "own rows" on public.sync_state;
create policy "own rows" on public.sync_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Trigger: incrementa o rev a cada push do desktop ou captura do celular ───
create or replace function public.bump_sync_rev() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  insert into public.sync_state (user_id, rev, updated_at) values (uid, 1, now())
  on conflict (user_id) do update
    set rev = public.sync_state.rev + 1, updated_at = now();
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bump on public.agenda_mirror;
drop trigger if exists trg_bump on public.finance_summary;
drop trigger if exists trg_bump on public.contact_today;
drop trigger if exists trg_bump on public.focus_metrics;
drop trigger if exists trg_bump on public.capture_inbox;

create trigger trg_bump after insert or update or delete on public.agenda_mirror
  for each row execute function public.bump_sync_rev();
create trigger trg_bump after insert or update or delete on public.finance_summary
  for each row execute function public.bump_sync_rev();
create trigger trg_bump after insert or update or delete on public.contact_today
  for each row execute function public.bump_sync_rev();
create trigger trg_bump after insert or update or delete on public.focus_metrics
  for each row execute function public.bump_sync_rev();
create trigger trg_bump after insert or update or delete on public.capture_inbox
  for each row execute function public.bump_sync_rev();
