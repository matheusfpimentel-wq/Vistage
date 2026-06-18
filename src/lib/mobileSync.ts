// Sincronização do espelho mobile (desktop ⇄ Supabase).
//
// PUSH: calcula o espelho mínimo a partir do banco LOCAL e sobe pras 4 tabelas de
//       leitura (agenda/saldo/contato/foco). Privacidade: finanças detalhadas
//       NUNCA sobem — só os números do resumo.
// PULL: lê a capture_inbox não consumida, cria os registros locais e marca como
//       consumida. RLS garante que tudo é da própria conta (user_id = auth.uid()).

import { getDb, type Db } from "./db";
import { supabase, currentUser } from "./supabase";

// ── Config (app_settings) ───────────────────────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const rows = await getDb().select<{ value: string | null }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}
async function setSetting(key: string, value: string | null): Promise<void> {
  await getDb().execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

const K = {
  enabled: "mobile_sync.enabled",
  lastSyncAt: "mobile_sync.last_sync_at",
} as const;

export async function isSyncEnabled(): Promise<boolean> {
  return (await getSetting(K.enabled)) === "1";
}
export async function setSyncEnabled(on: boolean): Promise<void> {
  await setSetting(K.enabled, on ? "1" : "0");
}
export async function getLastSyncAt(): Promise<string | null> {
  return getSetting(K.lastSyncAt);
}

// ── Helpers de data ─────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
/** Segunda-feira da semana atual (chave do foco). */
function weekStartISO(): string {
  const d = new Date(todayISO());
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}
/** Combina data + hora "HH:MM" num timestamp ISO; só data se sem hora. */
function startAt(date: string, time: string | null): string {
  return time ? `${date}T${time}:00` : date;
}

// ── Builders do espelho (lêem o banco LOCAL) ────────────────────────────────
type AgendaRow = {
  user_id: string;
  source: string;
  source_id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  meta: Record<string, unknown>;
};

async function buildAgenda(uid: string): Promise<AgendaRow[]> {
  const db = getDb();
  const today = todayISO();
  const [gigs, classes, tasks] = await Promise.all([
    db.select<{ id: number; date: string; start_time: string | null; end_time: string | null; venue_name: string; venue_city: string | null; status: string }[]>(
      `SELECT id, date, start_time, end_time, venue_name, venue_city, status FROM gigs
        WHERE date >= $1 AND status != 'Cancelada' ORDER BY date LIMIT 100`,
      [today]
    ),
    db.select<{ id: number; date: string; start_time: string | null; subject: string | null }[]>(
      `SELECT id, date, start_time, subject FROM classes
        WHERE date >= $1 AND status = 'Agendada' ORDER BY date LIMIT 100`,
      [today]
    ),
    db.select<{ id: number; title: string; due_date: string | null; priority: string | null }[]>(
      `SELECT id, title, due_date, priority FROM tasks
        WHERE status NOT IN ('Concluída','Cancelada') AND due_date IS NOT NULL AND due_date >= $1
        ORDER BY due_date LIMIT 100`,
      [today]
    ),
  ]);

  const rows: AgendaRow[] = [];
  for (const g of gigs)
    rows.push({ user_id: uid, source: "gig", source_id: String(g.id), title: g.venue_name, start_at: startAt(g.date, g.start_time), end_at: g.end_time ? startAt(g.date, g.end_time) : null, location: g.venue_city, meta: { status: g.status } });
  for (const c of classes)
    rows.push({ user_id: uid, source: "class", source_id: String(c.id), title: c.subject ?? "Aula", start_at: startAt(c.date, c.start_time), end_at: null, location: null, meta: {} });
  for (const t of tasks)
    rows.push({ user_id: uid, source: "task", source_id: String(t.id), title: t.title, start_at: t.due_date, end_at: null, location: null, meta: { priority: t.priority } });
  return rows;
}

async function buildFinance(uid: string) {
  const db = getDb();
  const month = monthKey();
  const sums = await db.select<{ kind: string; total: number }[]>(
    `SELECT kind, COALESCE(SUM(amount),0) AS total FROM finance_transactions
      WHERE substr(date,1,7) = $1 GROUP BY kind`,
    [month]
  );
  let income = 0;
  let expense = 0;
  for (const s of sums) {
    if (s.kind === "income") income = s.total;
    else if (s.kind === "expense") expense = s.total;
  }
  const recv = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount),0) AS total FROM finance_transactions
      WHERE kind = 'income' AND status = 'Previsto'`,
    []
  );
  return { user_id: uid, month, balance: income - expense, to_receive: recv[0]?.total ?? 0 };
}

async function buildContacts(uid: string) {
  const db = getDb();
  const today = todayISO();
  // Os 3 contatos com interação mais antiga (candidatos a follow-up).
  const rows = await db.select<{ id: number; name: string; phone: string | null; last_interaction_at: string | null }[]>(
    `SELECT id, name, phone, last_interaction_at FROM contacts
      WHERE last_interaction_at IS NOT NULL ORDER BY last_interaction_at ASC LIMIT 3`,
    []
  );
  return rows.map((c) => {
    const days = c.last_interaction_at
      ? Math.floor((Date.now() - new Date(c.last_interaction_at).getTime()) / 86_400_000)
      : null;
    return {
      user_id: uid,
      source_id: String(c.id),
      name: c.name,
      reason: days != null ? `Sem contato há ${days} dias` : "Follow-up",
      handle: c.phone,
      due_date: today,
    };
  });
}

async function buildFocus(uid: string) {
  const db = getDb();
  const week = weekStartISO();
  const sessions = await db.select<{ activity_type: string; started_at: string; ended_at: string | null; energy_level: number | null; focus_level: number | null }[]>(
    `SELECT activity_type, started_at, ended_at, energy_level, focus_level FROM work_sessions
      WHERE ended_at IS NOT NULL AND started_at >= $1`,
    [week]
  );
  let totalMin = 0;
  let eSum = 0;
  let eN = 0;
  let fSum = 0;
  let fN = 0;
  const byAct: Record<string, number> = {};
  for (const s of sessions) {
    const min = (new Date(s.ended_at as string).getTime() - new Date(s.started_at).getTime()) / 60_000;
    if (min > 0) {
      totalMin += min;
      byAct[s.activity_type] = (byAct[s.activity_type] ?? 0) + min;
    }
    if (s.energy_level != null) { eSum += s.energy_level; eN++; }
    if (s.focus_level != null) { fSum += s.focus_level; fN++; }
  }
  const payload = {
    total_minutes: Math.round(totalMin),
    avg_energy: eN ? Number((eSum / eN).toFixed(1)) : null,
    avg_focus: fN ? Number((fSum / fN).toFixed(1)) : null,
    by_activity: Object.entries(byAct).map(([activity_type, minutes]) => ({ activity_type, minutes: Math.round(minutes) })),
  };
  return { user_id: uid, week, payload };
}

// ── PUSH ────────────────────────────────────────────────────────────────────
export async function pushMirror(): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Não autenticado no Supabase.");
  const uid = user.id;

  const [agenda, finance, contacts, focus] = await Promise.all([
    buildAgenda(uid),
    buildFinance(uid),
    buildContacts(uid),
    buildFocus(uid),
  ]);

  // agenda e contato do dia: snapshot (apaga as próprias linhas e reinsere o set atual).
  await supabase.from("agenda_mirror").delete().eq("user_id", uid);
  if (agenda.length) {
    const { error } = await supabase.from("agenda_mirror").insert(agenda);
    if (error) throw error;
  }
  await supabase.from("contact_today").delete().eq("user_id", uid);
  if (contacts.length) {
    const { error } = await supabase.from("contact_today").insert(contacts);
    if (error) throw error;
  }
  // resumo e foco: 1 linha por período → upsert.
  {
    const { error } = await supabase.from("finance_summary").upsert(finance, { onConflict: "user_id,month" });
    if (error) throw error;
  }
  {
    const { error } = await supabase.from("focus_metrics").upsert(focus, { onConflict: "user_id,week" });
    if (error) throw error;
  }
}

// ── PULL (capturas do celular → banco local) ────────────────────────────────
type CaptureRow = { id: string; kind: string; payload: Record<string, unknown> };

export async function pullCaptures(): Promise<number> {
  const { data, error } = await supabase
    .from("capture_inbox")
    .select("id, kind, payload")
    .is("consumed_at", null);
  if (error) throw error;
  const captures = (data ?? []) as CaptureRow[];
  if (!captures.length) return 0;

  const db = getDb();
  const done: string[] = [];
  for (const c of captures) {
    try {
      await ingest(db, c.kind, c.payload);
      done.push(c.id);
    } catch (e) {
      console.error("Falha ao ingerir captura", c.id, e);
    }
  }
  if (done.length) {
    const { error: upErr } = await supabase
      .from("capture_inbox")
      .update({ consumed_at: new Date().toISOString() })
      .in("id", done);
    if (upErr) throw upErr;
  }
  return done.length;
}

async function ingest(db: Db, kind: string, p: Record<string, unknown>): Promise<void> {
  const s = (k: string): string | null => (typeof p[k] === "string" ? (p[k] as string) : null);
  const n = (k: string): number | null => (typeof p[k] === "number" ? (p[k] as number) : null);

  if (kind === "session") {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO work_sessions (started_at, ended_at, activity_type, energy_level, focus_level, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [s("started_at") ?? now, s("ended_at") ?? now, s("activity_type") ?? "Outro", n("energy_level"), n("focus_level"), s("notes")]
    );
  } else if (kind === "highlight" || kind === "note") {
    await db.execute(
      `INSERT INTO highlights (title, date, body) VALUES ($1, $2, $3)`,
      [s("title") ?? (kind === "note" ? "Nota" : "Destaque"), s("date") ?? todayISO(), s("body") ?? s("text")]
    );
  } else if (kind === "task") {
    await db.execute(
      `INSERT INTO tasks (title, description, category, priority, status, due_date)
       VALUES ($1, $2, $3, $4, 'A fazer', $5)`,
      [s("title") ?? "Tarefa", s("description"), s("category"), s("priority") ?? "Média", s("due_date")]
    );
  } else {
    throw new Error("Tipo de captura desconhecido: " + kind);
  }
}

// ── Orquestração ────────────────────────────────────────────────────────────
export async function syncNow(): Promise<{ pulled: number }> {
  await pushMirror();
  const pulled = await pullCaptures();
  await setSetting(K.lastSyncAt, new Date().toISOString());
  return { pulled };
}
