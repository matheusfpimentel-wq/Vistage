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
-- Modelo: UMA CONTA POR DJ/ARQUIVO. Cada linha carrega user_id = auth.uid() e o
-- RLS restringe tudo ao dono. Multi-dispositivo é nativo do Supabase Auth (vários
-- aparelhos na mesma conta). Distribuível: cada DJ é uma conta independente.
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

-- ── Leitura: "Esfriando" — o que o artista alimenta e ficou parado ──────────
-- Não é só CRM: traz contatos, fãs, faixas e conteúdos sem movimento além do
-- tempo de resfriamento configurável. O TIPO viaja no prefixo do source_id
-- ("contact:" / "fan:" / "track:" / "content:") — sem coluna nova. O desktop
-- reescreve o conjunto inteiro a cada sync (delete + insert), então mudar o
-- formato do source_id é seguro.
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
  consumed_at timestamptz,                         -- fundida no arquivo local
  discarded_at timestamptz,                        -- descartada (recuperável no Backup)
  unique (user_id, client_ref)
);
-- pending = consumed_at IS NULL AND discarded_at IS NULL.
alter table public.capture_inbox add column if not exists discarded_at timestamptz;
create index if not exists idx_inbox_discarded on public.capture_inbox (user_id, discarded_at)
  where consumed_at is null and discarded_at is not null;

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
-- SECURITY INVOKER (roda como o usuário; o RLS de sync_state cobre o insert) e
-- sem EXECUTE pra API — a função só serve de trigger, não de RPC pública.
create or replace function public.bump_sync_rev() returns trigger
  language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  insert into public.sync_state (user_id, rev, updated_at) values (uid, 1, now())
  on conflict (user_id) do update
    set rev = public.sync_state.rev + 1, updated_at = now();
  return coalesce(new, old);
end;
$$;

revoke execute on function public.bump_sync_rev() from public, anon, authenticated;

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

-- ── Realtime: o desktop assina INSERTs da capture_inbox pra puxar na hora ────
-- (a RLS continua valendo: cada conta só recebe eventos das próprias linhas)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'capture_inbox'
  ) then
    alter publication supabase_realtime add table public.capture_inbox;
  end if;
end $$;

-- ============================================================================
-- Consulta no celular: catálogo pesquisável + preferências de aparência
-- ============================================================================

-- ── Leitura: catálogo pesquisável (GIGs / músicas / pessoas / venues) ────────
-- Espelho enxuto pra CONSULTA no celular. Snapshot reconstruído a cada push do
-- desktop. search_text = concatenação minúscula pra busca ilike.
create table if not exists public.catalog_mirror (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,                       -- 'gig' | 'track' | 'contact' | 'venue'
  source_id   text not null,                       -- id local
  title       text not null,
  subtitle    text,
  search_text text,                                -- lower(concat) pra busca ilike
  meta        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, kind, source_id)
);
create index if not exists idx_catalog_user_kind on public.catalog_mirror (user_id, kind);

-- ── Preferências de aparência (tema/acento) espelhadas do desktop ────────────
create table if not exists public.user_preferences (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme       text,                                -- 'light' | 'dark'
  accent      text,                                -- 'violet' | 'blue' | ...
  artist_name  text,                               -- nome artístico (header do celular)
  isotype      text,                               -- isótipo em data URL (base64), opcional
  focus_streak integer,                            -- 🔥 dias seguidos de foco
  updated_at  timestamptz not null default now()
);
-- Colunas adicionadas depois (idempotente p/ bancos já criados):
alter table public.user_preferences add column if not exists artist_name  text;
alter table public.user_preferences add column if not exists isotype      text;
alter table public.user_preferences add column if not exists focus_streak integer;

alter table public.catalog_mirror   enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists "own rows" on public.catalog_mirror;
drop policy if exists "own rows" on public.user_preferences;

create policy "own rows" on public.catalog_mirror
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_bump on public.catalog_mirror;
create trigger trg_bump after insert or update or delete on public.catalog_mirror
  for each row execute function public.bump_sync_rev();

-- ── Leitura: tarefas pendentes (modo foco → painel de Gestão no celular) ─────
-- Snapshot das tarefas em aberto pra tickar no celular. Marcar concluída insere
-- uma captura 'task_done' na capture_inbox; o desktop conclui de fato na revisão.
create table if not exists public.tasks_mirror (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id   text not null,                       -- id local da tarefa
  title       text not null,
  priority    text,
  due_date    date,
  category    text,
  updated_at  timestamptz not null default now(),
  unique (user_id, source_id)
);
create index if not exists idx_tasks_user on public.tasks_mirror (user_id);

alter table public.tasks_mirror enable row level security;
drop policy if exists "own rows" on public.tasks_mirror;
create policy "own rows" on public.tasks_mirror
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_bump on public.tasks_mirror;
create trigger trg_bump after insert or update or delete on public.tasks_mirror
  for each row execute function public.bump_sync_rev();

-- ============================================================================
-- Web push (resumo diário + lembretes + foco) — Fase 4
-- ============================================================================
-- Pipeline: PWA inscreve via PushManager → push_subscriptions. A Edge Function
-- `send-push` (verify_jwt=false, auth própria) monta o resumo do dia a partir do
-- espelho (agenda_mirror/contact_today) e envia via web-push usando as chaves
-- VAPID. Um cron diário (pg_cron + pg_net) chama a função com o header
-- x-cron-secret. As chaves VAPID e o cron_secret ficam em app_secrets (somente
-- service_role) e NUNCA no repositório.

-- Inscrições de web-push (uma por dispositivo/endpoint).
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own rows" on public.push_subscriptions;
create policy "own rows" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Segredos do servidor (VAPID, cron). RLS ligado e SEM policy: nenhum cliente
-- lê; só a Edge Function (service_role) acessa. Os VALORES são inseridos fora do
-- versionamento (via SQL direto), nunca commitados.
create table if not exists public.app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

-- Cron diário (08:00 BRT ≈ 11:00 UTC), criado fora do versionamento:
--   select cron.schedule('vistage-daily-push', '0 11 * * *', $$
--     select net.http_post(
--       url := 'https://<ref>.supabase.co/functions/v1/send-push',
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-cron-secret', (select value from public.app_secrets where key='cron_secret')),
--       body := '{}'::jsonb);
--   $$);

-- ── Leitura: alertas (sininho do celular = MESMOS do PC) ──────────────────────
-- O desktop computa os alertas (computeAlerts + regras próprias) e sobe aqui;
-- o celular só lê. Snapshot por usuário (delete+insert no push).
create table if not exists public.alerts_mirror (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key      text not null,
  label    text,
  route    text,
  critical boolean not null default false,
  icon     text,
  primary key (user_id, key)
);
alter table public.alerts_mirror enable row level security;
drop policy if exists "own rows" on public.alerts_mirror;
create policy "own rows" on public.alerts_mirror
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Leitura: provocações (insights iguais aos do PC) ──────────────────────────
create table if not exists public.provocations_mirror (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key     text not null,
  text    text,
  primary key (user_id, key)
);
alter table public.provocations_mirror enable row level security;
drop policy if exists "own rows" on public.provocations_mirror;
create policy "own rows" on public.provocations_mirror
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- §5 — Relay de MÍDIA da GIG (Storage). Ponte EFÊMERA: o celular sobe a
-- foto/clipe comprimido pra cá; o PC baixa na revisão de capturas, grava em
-- uploads/ e APAGA o objeto (o relay não guarda mídia — só transporta). Por isso
-- o custo de Storage fica baixo: os objetos vivem só até o PC consumir.
-- Bucket PRIVADO; a RLS deixa cada conta mexer só na PRÓPRIA pasta — o path é
-- `{auth.uid()}/{ref}.{ext}`, então a 1ª pasta do nome tem que bater com o uid.
-- Idempotente: bucket via on conflict; policies via drop if exists + create.
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('gig-media', 'gig-media', false)
  on conflict (id) do nothing;

drop policy if exists "gig-media own read"   on storage.objects;
drop policy if exists "gig-media own insert" on storage.objects;
drop policy if exists "gig-media own update" on storage.objects;
drop policy if exists "gig-media own delete" on storage.objects;

create policy "gig-media own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'gig-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gig-media own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gig-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- upsert do upload (retry pós-queda) faz UPDATE do objeto existente.
create policy "gig-media own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'gig-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'gig-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gig-media own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gig-media' and (storage.foldername(name))[1] = auth.uid()::text);
