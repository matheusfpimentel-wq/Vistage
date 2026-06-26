// Sincronização do espelho mobile (desktop ⇄ Supabase).
//
// PUSH: calcula o espelho mínimo a partir do banco LOCAL e sobe pras 4 tabelas de
//       leitura (agenda/saldo/contato/foco). Privacidade: finanças detalhadas
//       NUNCA sobem — só os números do resumo.
// PULL: lê a capture_inbox não consumida, cria os registros locais e marca como
//       consumida. RLS garante que tudo é da própria conta (user_id = auth.uid()).

import { create } from "zustand";
import { readFile } from "@tauri-apps/plugin-fs";
import { getDb, type Db } from "./db";
import { supabase, currentUser } from "./supabase";
import { toLocalISODate, toLocalYearMonth } from "./format";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { loadIdentity } from "@/modules/identity/api";
import { loadFocusStreak } from "@/modules/foco/api";
import { loadWeekStats } from "@/modules/revisao/api";
import { computeAlerts } from "@/modules/revisao/alerts";
import { getDisabledRuleIds } from "@/modules/revisao/ruleConfig";
import { evaluateCustomRules } from "@/modules/revisao/customRules";
import { loadExtraStats } from "@/components/shared/NotificationBell";
import { EVERGREEN, generateRaw } from "@/modules/ideas/provocations";

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
// Fuso LOCAL, não UTC: com toISOString() no Brasil (UTC-3) das 21h à meia-noite
// o "hoje"/"este mês" pulava pro dia/mês seguinte, bagunçando os buckets do sync.
function todayISO(): string {
  return toLocalISODate();
}
function monthKey(): string {
  return toLocalYearMonth(); // YYYY-MM local
}
/** Segunda-feira da semana atual (chave do foco). */
function weekStartISO(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return toLocalISODate(d);
}
/** Offset local ("-03:00") na data dada — pra o timestamptz do Supabase guardar
 *  o INSTANTE certo. Sem isso, "20:00" sem fuso virava UTC e o celular voltava
 *  3h a menos. Meio-dia evita pular o dia ao calcular o offset. */
function tzOffset(date: string): string {
  const mins = -new Date(`${date}T12:00:00`).getTimezoneOffset();
  const sign = mins >= 0 ? "+" : "-";
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** Combina data + hora "HH:MM" num timestamp COM fuso local. Sem hora → meia-noite
 *  local (o celular trata meia-noite como "dia inteiro" na exibição). */
function startAt(date: string, time: string | null): string {
  return `${date}T${time ?? "00:00"}:00${tzOffset(date)}`;
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
    db.select<{ id: number; date: string; start_time: string | null; end_time: string | null; venue_name: string; event_name: string | null; recurring_event_name: string | null; venue_city: string | null; status: string }[]>(
      `SELECT id, date, start_time, end_time, venue_name, event_name, recurring_event_name, venue_city, status FROM gigs
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
    rows.push({ user_id: uid, source: "gig", source_id: String(g.id), title: gigDisplayName(g), start_at: startAt(g.date, g.start_time), end_at: g.end_time ? startAt(g.date, g.end_time) : null, location: g.venue_city, meta: { status: g.status } });
  for (const c of classes)
    rows.push({ user_id: uid, source: "class", source_id: String(c.id), title: c.subject ?? "Aula", start_at: startAt(c.date, c.start_time), end_at: null, location: null, meta: {} });
  for (const t of tasks)
    rows.push({ user_id: uid, source: "task", source_id: String(t.id), title: t.title, start_at: t.due_date ? startAt(t.due_date, null) : null, end_at: null, location: null, meta: { priority: t.priority } });
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

// ── Tarefas pendentes (modo foco → painel de Gestão no celular) ─────────────
async function buildTasks(uid: string) {
  const db = getDb();
  const rows = await db.select<
    { id: number; title: string; priority: string | null; due_date: string | null; category: string | null }[]
  >(
    `SELECT id, title, priority, due_date, category FROM tasks
      WHERE status NOT IN ('Concluída','Cancelada')
      ORDER BY (due_date IS NULL), due_date LIMIT 50`,
    []
  );
  return rows.map((t) => ({
    user_id: uid,
    source_id: String(t.id),
    title: t.title,
    priority: t.priority,
    due_date: t.due_date,
    category: t.category,
  }));
}

// ── Catálogo pesquisável (consulta no celular) ──────────────────────────────
type CatalogRow = {
  user_id: string;
  kind: string; // 'gig' | 'track' | 'contact' | 'venue'
  source_id: string;
  title: string;
  subtitle: string | null;
  search_text: string;
  meta: Record<string, unknown>;
};

function lc(...parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
}

/** Períodos de set (time_slots) pro espelho — alimenta o palco no modo foco. */
function parseMirrorSlots(time_slots: string | null, start: string | null, end: string | null): { start: string; end: string }[] {
  try {
    const arr = time_slots ? (JSON.parse(time_slots) as unknown) : null;
    if (Array.isArray(arr)) {
      const slots = arr
        .filter((s): s is { start?: string; end?: string } => !!s && typeof s === "object")
        .map((s) => ({ start: String(s.start ?? ""), end: String(s.end ?? "") }))
        .filter((s) => s.start || s.end);
      if (slots.length > 0) return slots;
    }
  } catch {
    /* cai no fallback */
  }
  if (start || end) return [{ start: start ?? "", end: end ?? "" }];
  return [];
}

/** Ideias de música (gig_research) pro espelho — alimenta o palco no modo foco. */
function parseMirrorIdeas(gig_research: string | null): string[] {
  try {
    const arr = gig_research ? (JSON.parse(gig_research) as unknown) : null;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((r) => {
        if (r && typeof r === "object") {
          const o = r as { title?: unknown; artist?: unknown };
          const t = typeof o.title === "string" ? o.title : "";
          const a = typeof o.artist === "string" ? o.artist : "";
          return [t, a].filter(Boolean).join(" · ");
        }
        return typeof r === "string" ? r : "";
      })
      .filter((x) => x.trim().length > 0)
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function buildCatalog(uid: string): Promise<CatalogRow[]> {
  const db = getDb();
  const rows: CatalogRow[] = [];

  // GIGs — inclui passadas (consulta), com contato do dia e contratante pra
  // alimentar o modo foco/palco depois. Cachê é da própria conta (RLS).
  const gigs = await db.select<{
    id: number; date: string; start_time: string | null; end_time: string | null;
    venue_name: string; event_name: string | null; recurring_event_name: string | null;
    venue_city: string | null; status: string; cache_amount: number | null;
    day_contact_name: string | null; day_contact_phone: string | null; promoter_name: string | null;
    time_slots: string | null; gig_research: string | null;
  }[]>(
    `SELECT g.id, g.date, g.start_time, g.end_time, g.venue_name, g.event_name, g.recurring_event_name,
            g.venue_city, g.status, g.cache_amount, g.day_contact_name, g.day_contact_phone,
            pc.name AS promoter_name, g.time_slots, g.gig_research
       FROM gigs g
       LEFT JOIN contacts pc ON pc.id = g.promoter_contact_id
      ORDER BY g.date DESC LIMIT 800`,
    []
  );
  for (const g of gigs) {
    // Título da festa (recorrente - edição / evento), com fallback pro venue —
    // mesmo padrão do desktop (gigDisplayName). Antes ia só o venue.
    const gigTitle = gigDisplayName(g);
    rows.push({
      user_id: uid, kind: "gig", source_id: String(g.id),
      title: gigTitle,
      subtitle: [g.date, g.venue_city, g.status].filter(Boolean).join(" · "),
      search_text: lc(gigTitle, g.venue_name, g.event_name, g.recurring_event_name, g.venue_city, g.status, g.date, g.promoter_name, g.day_contact_name),
      meta: {
        date: g.date, start_time: g.start_time, end_time: g.end_time, city: g.venue_city,
        status: g.status, cache_amount: g.cache_amount, promoter_name: g.promoter_name,
        day_contact_name: g.day_contact_name, day_contact_phone: g.day_contact_phone,
        // Modo foco/palco no celular: períodos de set + ideias de música da GIG.
        set_periods: parseMirrorSlots(g.time_slots, g.start_time, g.end_time),
        ideas: parseMirrorIdeas(g.gig_research),
      },
    });
  }

  // Músicas (tracks) — título final ou de trabalho; estágio/projeto/gênero.
  const tracks = await db.select<{
    id: number; title_working: string; title_final: string | null; current_stage: string;
    bpm: number | null; key: string | null; genre_primary: string | null; project: string | null;
    concept_narrative: string | null;
  }[]>(
    `SELECT t.id, t.title_working, t.title_final, t.current_stage, t.bpm, t.key,
            t.genre_primary, mp.title AS project, t.concept_narrative
       FROM tracks t
       LEFT JOIN music_projects mp ON mp.id = t.project_id
      ORDER BY t.updated_at DESC LIMIT 800`,
    []
  );
  for (const t of tracks) {
    const title = (t.title_final && t.title_final.trim()) || t.title_working;
    rows.push({
      user_id: uid, kind: "track", source_id: String(t.id),
      title,
      subtitle: [t.current_stage, t.project].filter(Boolean).join(" · "),
      search_text: lc(title, t.project, t.current_stage, t.genre_primary, t.key),
      // concept: conceito da faixa pro modo foco/música no celular.
      meta: { stage: t.current_stage, bpm: t.bpm, key: t.key, genre: t.genre_primary, project: t.project, concept: t.concept_narrative },
    });
  }

  // Pessoas (contatos) — diretório pesquisável.
  const contacts = await db.select<{
    id: number; name: string; city: string | null; phone: string | null; email: string | null;
    instagram: string | null; company: string | null; relationship_types: string | null;
  }[]>(
    `SELECT id, name, city, phone, email, instagram, company, relationship_types
       FROM contacts ORDER BY name LIMIT 2000`,
    []
  );
  for (const c of contacts) {
    let roles: string[] = [];
    try { roles = c.relationship_types ? (JSON.parse(c.relationship_types) as string[]) : []; } catch { roles = []; }
    rows.push({
      user_id: uid, kind: "contact", source_id: String(c.id),
      title: c.name,
      subtitle: [c.city, c.company, roles.join(", ")].filter(Boolean).join(" · ") || null,
      search_text: lc(c.name, c.city, c.company, c.phone, c.email, c.instagram, roles.join(" ")),
      meta: { city: c.city, phone: c.phone, email: c.email, instagram: c.instagram, company: c.company, roles },
    });
  }

  // Venues.
  const venues = await db.select<{ id: number; name: string; city: string | null; state: string | null; capacity: number | null }[]>(
    `SELECT id, name, city, state, capacity FROM venues ORDER BY name LIMIT 800`,
    []
  );
  for (const v of venues)
    rows.push({
      user_id: uid, kind: "venue", source_id: String(v.id),
      title: v.name,
      subtitle: [v.city, v.state].filter(Boolean).join(", ") || null,
      search_text: lc(v.name, v.city, v.state),
      meta: { city: v.city, state: v.state, capacity: v.capacity },
    });

  // Tarefas em aberto — pesquisáveis no celular (busca por tarefa).
  const ctasks = await db.select<{ id: number; title: string; status: string; priority: string | null; due_date: string | null; category: string | null }[]>(
    `SELECT id, title, status, priority, due_date, category FROM tasks
      WHERE status NOT IN ('Concluída','Cancelada') ORDER BY due_date IS NULL, due_date LIMIT 800`,
    []
  );
  for (const t of ctasks)
    rows.push({
      user_id: uid, kind: "task", source_id: String(t.id),
      title: t.title,
      subtitle: [t.category, t.priority, t.due_date].filter(Boolean).join(" · ") || null,
      search_text: lc(t.title, t.category, t.priority),
      meta: { status: t.status, priority: t.priority, due_date: t.due_date, category: t.category },
    });

  // Ideias — pesquisáveis no celular (busca por ideia).
  const cideas = await db.select<{ id: number; title: string; body: string | null; category: string | null; maturation: string; heat: number }[]>(
    `SELECT id, title, body, category, maturation, heat FROM ideas ORDER BY updated_at DESC LIMIT 800`,
    []
  );
  for (const i of cideas)
    rows.push({
      user_id: uid, kind: "idea", source_id: String(i.id),
      title: i.title,
      subtitle: [i.category, i.maturation].filter(Boolean).join(" · ") || null,
      search_text: lc(i.title, i.body, i.category, i.maturation),
      meta: { body: i.body, category: i.category, maturation: i.maturation, heat: i.heat },
    });

  // Aulas — pesquisáveis no celular (busca por aula/aluno).
  const cclasses = await db.select<{ id: number; subject: string | null; date: string; status: string; student_name: string | null }[]>(
    `SELECT c.id, c.subject, c.date, c.status, s.name AS student_name
       FROM classes c LEFT JOIN students s ON s.id = c.student_id
      ORDER BY c.date DESC LIMIT 500`,
    []
  );
  for (const cl of cclasses)
    rows.push({
      user_id: uid, kind: "class", source_id: String(cl.id),
      title: cl.subject ?? "Aula",
      subtitle: [cl.student_name, cl.date].filter(Boolean).join(" · ") || null,
      search_text: lc(cl.subject, cl.student_name, cl.date, cl.status),
      meta: { date: cl.date, status: cl.status, student_name: cl.student_name },
    });

  return rows;
}

/** Tema/acento do DOCUMENTO (document_settings) → espelho pro celular. */
/** Lê o isótipo do disco e devolve como data URL (base64), pra exibir no header
 *  do celular. Best-effort: arquivo grande/ilegível → null (cai no monograma). */
async function isotypeDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const bytes = (await readFile(path)) as Uint8Array;
    if (!bytes || bytes.length === 0 || bytes.length > 500_000) return null;
    const ext = (path.toLowerCase().split(".").pop() ?? "").trim();
    const mime =
      ext === "png" ? "image/png"
      : ext === "svg" ? "image/svg+xml"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

type Preferences = {
  user_id: string;
  theme: string;
  accent: string;
  artist_name: string | null;
  isotype: string | null;
  focus_streak: number;
};

async function buildPreferences(uid: string): Promise<Preferences> {
  let theme = "dark";
  let accent = "violet";
  try {
    const rows = await getDb().select<{ key: string; value: string }[]>(
      "SELECT key, value FROM document_settings WHERE key IN ('theme','accent')"
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const dt = map.get("theme");
    // "color" era um 3º tema removido — trata como claro (a base dele).
    if (dt === "dark") theme = "dark";
    else if (dt === "light" || dt === "color") theme = "light";
    if (map.get("accent")) accent = map.get("accent")!;
  } catch {
    if (typeof localStorage !== "undefined") {
      theme = localStorage.getItem("vistage.theme") === "light" ? "light" : "dark";
      accent = localStorage.getItem("vistage.accent") ?? "violet";
    }
  }

  // Identidade (nome artístico + isótipo) e streak de foco — pro header do celular.
  let artist_name: string | null = null;
  let isotype: string | null = null;
  let focus_streak = 0;
  try {
    const id = await loadIdentity();
    artist_name = id.artist_name?.trim() || null;
    isotype = await isotypeDataUrl(id.isotype_path);
  } catch {
    /* sem identidade ainda */
  }
  try {
    focus_streak = await loadFocusStreak();
  } catch {
    /* 0 */
  }

  return { user_id: uid, theme, accent, artist_name, isotype, focus_streak };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── PUSH ────────────────────────────────────────────────────────────────────
export async function pushMirror(): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Não autenticado no Supabase.");
  const uid = user.id;

  const [agenda, finance, contacts, focus, catalog, tasks, alerts, provocations] = await Promise.all([
    buildAgenda(uid),
    buildFinance(uid),
    buildContacts(uid),
    buildFocus(uid),
    buildCatalog(uid),
    buildTasks(uid),
    buildAlerts(uid),
    buildProvocations(uid),
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
  // catálogo de consulta: snapshot (apaga as próprias linhas e reinsere em lotes).
  await supabase.from("catalog_mirror").delete().eq("user_id", uid);
  for (const part of chunk(catalog, 500)) {
    const { error } = await supabase.from("catalog_mirror").insert(part);
    if (error) throw error;
  }
  // tarefas pendentes (Gestão no foco): snapshot.
  await supabase.from("tasks_mirror").delete().eq("user_id", uid);
  if (tasks.length) {
    const { error } = await supabase.from("tasks_mirror").insert(tasks);
    if (error) throw error;
  }
  // alertas (sininho = MESMOS do PC): snapshot.
  await supabase.from("alerts_mirror").delete().eq("user_id", uid);
  if (alerts.length) {
    const { error } = await supabase.from("alerts_mirror").insert(alerts);
    if (error) throw error;
  }
  // provocações (insights iguais aos do PC): snapshot.
  await supabase.from("provocations_mirror").delete().eq("user_id", uid);
  if (provocations.length) {
    for (const part of chunk(provocations, 500)) {
      const { error } = await supabase.from("provocations_mirror").insert(part);
      if (error) throw error;
    }
  }
  // aparência: tema/acento do documento → 1 linha por conta.
  const prefs = await buildPreferences(uid);
  {
    const { error } = await supabase.from("user_preferences").upsert(prefs, { onConflict: "user_id" });
    if (error) throw error;
  }
}

// Alertas: exatamente os mesmos que o sininho do PC mostra (computeAlerts +
// regras próprias). Snapshot por usuário. Se algo falhar, devolve vazio (o
// celular simplesmente não mostra alarme em vez de quebrar o push inteiro).
async function buildAlerts(uid: string): Promise<
  { user_id: string; key: string; label: string; route: string | null; critical: boolean; icon: string }[]
> {
  try {
    const [stats, extra] = await Promise.all([loadWeekStats(), loadExtraStats()]);
    const items = [...computeAlerts(stats, extra, getDisabledRuleIds()), ...(await evaluateCustomRules())];
    const seen = new Set<string>();
    const out: { user_id: string; key: string; label: string; route: string | null; critical: boolean; icon: string }[] = [];
    for (const a of items) {
      if (seen.has(a.key)) continue;
      seen.add(a.key);
      out.push({ user_id: uid, key: a.key, label: a.label, route: a.to ?? null, critical: !!a.critical, icon: a.icon });
    }
    return out;
  } catch {
    return [];
  }
}

// Provocações: as MESMAS do PC (perenes + derivadas dos dados). Sem filtrar as
// ocultas/excluídas (isso é preferência de máquina, localStorage do desktop).
async function buildProvocations(uid: string): Promise<{ user_id: string; key: string; text: string }[]> {
  const out: { user_id: string; key: string; text: string }[] = [];
  const seen = new Set<string>();
  const add = (key: string, text: string) => {
    if (seen.has(key)) return; // PK é (user_id, key) — chaves repetidas quebram o insert
    seen.add(key);
    out.push({ user_id: uid, key, text });
  };
  EVERGREEN.forEach((t, i) => add(`eg:${i}`, t));
  try {
    const raw = await generateRaw();
    for (const r of raw) add(r.key, r.text);
  } catch {
    /* dados insuficientes — fica só com as perenes */
  }
  return out;
}

// ── Capturas do celular: REVISÃO no desktop (fundir / descartar) ─────────────
// O celular insere em capture_inbox; o desktop NÃO aplica sozinho — mostra um
// aviso pra FUNDIR tudo (ingerir no banco local) ou DESCARTAR. O descartado fica
// recuperável no Backup. pending = consumed_at NULL AND discarded_at NULL.
export type PendingCapture = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/** Store React: capturas aguardando revisão (alimenta o diálogo global). */
export const useMobileChanges = create<{
  pending: PendingCapture[];
  setPending: (c: PendingCapture[]) => void;
  refresh: () => Promise<void>;
}>((set) => ({
  pending: [],
  setPending: (pending) => set({ pending }),
  refresh: async () => {
    try {
      set({ pending: await fetchPendingCaptures() });
    } catch {
      /* sem login / offline → ignora */
    }
  },
}));

export async function fetchPendingCaptures(): Promise<PendingCapture[]> {
  const { data, error } = await supabase
    .from("capture_inbox")
    .select("id, kind, payload, created_at")
    .is("consumed_at", null)
    .is("discarded_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PendingCapture[];
}

export async function listDiscardedCaptures(): Promise<PendingCapture[]> {
  const { data, error } = await supabase
    .from("capture_inbox")
    .select("id, kind, payload, created_at")
    .is("consumed_at", null)
    .not("discarded_at", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PendingCapture[];
}

/** Funde: ingere no banco local as capturas dadas e marca como consumidas. */
export async function ingestCaptures(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from("capture_inbox")
    .select("id, kind, payload")
    .in("id", ids);
  if (error) throw error;
  const caps = (data ?? []) as { id: string; kind: string; payload: Record<string, unknown> }[];
  const db = getDb();
  const done: string[] = [];
  for (const c of caps) {
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
      .update({ consumed_at: new Date().toISOString(), discarded_at: null })
      .in("id", done);
    if (upErr) throw upErr;
  }
  return done.length;
}

/** Descarta (recuperável): marca discarded_at, sem aplicar nada no banco local. */
export async function discardCaptures(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from("capture_inbox")
    .update({ discarded_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

/** Recuperar (do Backup) = aplicar de fato o que tinha sido descartado. */
export async function recoverCaptures(ids: string[]): Promise<number> {
  return ingestCaptures(ids);
}

/** Exclui de vez (hard delete) as capturas descartadas — sem recuperação. */
export async function deleteCaptures(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("capture_inbox").delete().in("id", ids);
  if (error) throw error;
}

async function ingest(db: Db, kind: string, p: Record<string, unknown>): Promise<void> {
  const s = (k: string): string | null => (typeof p[k] === "string" ? (p[k] as string) : null);
  const n = (k: string): number | null => (typeof p[k] === "number" ? (p[k] as number) : null);

  if (kind === "session") {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO work_sessions (started_at, ended_at, activity_type, energy_level, focus_level, notes, planned_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [s("started_at") ?? now, s("ended_at") ?? now, s("activity_type") ?? "Outro", n("energy_level"), n("focus_level"), s("notes"), n("planned_minutes")]
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
  } else if (kind === "contact") {
    // Nova pessoa criada no celular (aditivo).
    const { createContact } = await import("@/modules/crm/api");
    await createContact({
      name: s("name") ?? "Sem nome",
      types: [],
      relationship_types: [],
      relationship_data: {},
      phone: s("phone"),
      email: s("email"),
      instagram: s("instagram"),
      city: s("city"),
      tags: [],
      notes: s("notes"),
      rating: null,
      photo_path: null,
      follower_count: null,
      venue_id: null,
      company: s("company"),
      birthday: null,
    });
  } else if (kind === "gig") {
    // Nova GIG criada no celular (aditivo). createGig monta o INSERT só com as
    // colunas passadas; o resto usa os defaults da tabela.
    const { createGig } = await import("@/modules/gigs/api");
    await createGig({
      date: s("date") ?? todayISO(),
      venue_name: s("venue_name") ?? "GIG",
      venue_city: s("city"),
      cache_amount: n("cache_amount"),
      general_notes: s("notes"),
      status: "Proposta",
    } as unknown as Parameters<typeof createGig>[0]);
  } else if (kind === "append_note") {
    // "Anotar em" um item do catálogo (pessoa/GIG/música/venue): só ACRESCENTA.
    const targetKind = s("target_kind");
    const targetId = s("target_id");
    const text = s("text");
    const map: Record<string, { table: string; col: string }> = {
      contact: { table: "contacts", col: "notes" },
      gig: { table: "gigs", col: "general_notes" },
      track: { table: "tracks", col: "stage_notes" },
      venue: { table: "venues", col: "notes" },
    };
    const tc = targetKind ? map[targetKind] : undefined;
    if (tc && targetId && text) {
      const stamped = `[celular ${todayISO()}] ${text}`;
      await db.execute(
        `UPDATE ${tc.table}
            SET ${tc.col} = TRIM(COALESCE(${tc.col} || char(10), '') || $1)
          WHERE id = $2`,
        [stamped, Number(targetId)]
      );
    }
  } else if (kind === "idea") {
    // Ideia solta do brainstorm no celular (aditivo) — entra como Embrião/fria.
    const { createIdea } = await import("@/modules/ideas/api");
    await createIdea({
      title: s("title") ?? "Ideia",
      body: s("body"),
      category: null,
      tags: [],
      heat: 1,
      maturation: "Embrião",
      converted_to: null,
      converted_id: null,
    });
  } else if (kind === "task_done") {
    // Tarefa tickada no celular → conclui de fato no banco local, com os efeitos
    // colaterais reais (sync de derivadas, tombstone do Todoist, etc.).
    const taskId = n("task_id");
    if (taskId) {
      const { updateTask } = await import("@/modules/tasks/api");
      await updateTask({ id: taskId, status: "Concluída" });
    }
  } else if (kind === "identity") {
    // Edição de identidade no celular (hoje: nome artístico). Atualiza o registro
    // local; o isótipo e o resto seguem editáveis só no PC.
    const name = s("artist_name");
    if (name != null) {
      await db.execute(
        `INSERT OR IGNORE INTO artist_identity (id, socials, palette) VALUES (1, '[]', '[]')`
      );
      await db.execute(
        `UPDATE artist_identity SET artist_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [name.trim()]
      );
    }
  } else {
    throw new Error("Tipo de captura desconhecido: " + kind);
  }
}

// ── Orquestração ────────────────────────────────────────────────────────────
// Sobe o espelho e atualiza a contagem de capturas aguardando revisão — NÃO
// aplica nada sozinho: quem decide fundir/descartar é o usuário pelo diálogo.
export async function syncNow(): Promise<{ pending: number }> {
  await pushMirror();
  await setSetting(K.lastSyncAt, new Date().toISOString());
  await useMobileChanges.getState().refresh();
  return { pending: useMobileChanges.getState().pending.length };
}

// ── Auto-sync (enquanto o app está aberto) ──────────────────────────────────
// Sincroniza ao abrir, a cada 3 min, e puxa NA HORA quando o celular insere uma
// captura (Supabase Realtime). Só age se houver sessão logada. Retorna a função
// de parada (para o useEffect limpar ao desmontar).
export function startAutoSync(): () => void {
  let stopped = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  // Só assina o Realtime DEPOIS de confirmar a sessão — sem login, o app nem
  // abre conexão com a nuvem (local-first).
  const ensureRealtime = () => {
    if (channel || stopped) return;
    channel = supabase
      .channel("capture-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "capture_inbox" },
        () => {
          void useMobileChanges.getState().refresh();
        }
      )
      .subscribe();
  };

  const tick = async () => {
    if (stopped) return;
    try {
      if (!(await currentUser())) return; // sem login → nem conecta na nuvem
      ensureRealtime();
      await syncNow();
    } catch (e) {
      console.warn("Auto-sync falhou:", e);
    }
  };

  void tick();
  const interval = window.setInterval(() => void tick(), 3 * 60_000);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    if (channel) void supabase.removeChannel(channel);
  };
}
