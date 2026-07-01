import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabase";
import { loadStreak } from "../identity";
import { loadProvocations } from "../insights";
import { enablePush, isPushEnabled, pushSupported, sendTestPush } from "../push";
import { reconcileLocalGigs, type LocalGig } from "../localGigs";
import { telLink, waLink, mapsLink } from "../links";

// ── Tipos base ──────────────────────────────────────────────────────────────
// Compromisso (agenda_mirror): GIG/aula/reunião futura + tarefa (inclui atrasada).
type Agenda = { id: string; source: string; source_id?: string; title: string; start_at: string | null; location: string | null };
// "Esfriando": item que o artista alimenta e ficou parado. O tipo vem no prefixo
// do source_id ("contact:" / "fan:" / "track:" / "content:") — espelho gerado no
// desktop. Sem prefixo (espelho antigo) cai em "contact".
type Cold = { id: string; source_id: string; name: string; reason: string | null; handle: string | null };
type ColdKind = "contact" | "fan" | "track" | "content";
function coldKind(c: Cold): ColdKind {
  const p = (c.source_id || "").split(":")[0];
  return p === "fan" || p === "track" || p === "content" ? p : "contact";
}
function isPerson(c: Cold): boolean {
  const k = coldKind(c);
  return k === "contact" || k === "fan";
}
function ColdIcon({ kind }: { kind: ColdKind }) {
  const p = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "fan") return <svg {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
  if (kind === "track") return <svg {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M8.5 18V6l11-2v12" /></svg>;
  if (kind === "content") return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3V9z" /></svg>;
  return <svg {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
const COLD_KIND_LABEL: Record<ColdKind, string> = { contact: "Contato", fan: "Fã", track: "Faixa", content: "Conteúdo" };

type StageSlot = { start: string; end: string };
type GigMeta = {
  date?: string;
  city?: string | null;
  venue_name?: string | null;
  address?: string | null;
  cache_amount?: number | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  set_periods?: StageSlot[];
  day_contact_name?: string | null;
  day_contact_phone?: string | null;
  promoter_name?: string | null;
  // Checklist de Preparação (aba Preparação): ids marcados. Alimenta o selo "prep pendente".
  prep_done?: string[];
};
type TrackMeta = { stage?: string | null; project?: string | null; genre?: string | null; bpm?: number | null; key?: string | null; concept?: string | null };
type PartyMeta = { status?: string | null; date?: string | null; venue_name?: string | null };

type GigRow = { source_id: string; title: string; meta: GigMeta; search_text?: string };
type TrackRow = { source_id: string; title: string; meta: TrackMeta };
type PartyRow = { source_id: string; title: string; meta: PartyMeta };
type CatalogGig = { title: string; meta: GigMeta };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Total de itens do checklist de Preparação (espelha PREP_GROUPS do Foco: 5+3+5).
const PREP_TOTAL = 13;
// Track "em produção" = tudo menos a criação já concluída (Pós-lançamento) —
// mesmo critério do "esfriando" do desktop.
const TRACK_DONE_STAGE = "Pós-lançamento";
// Festa "em aberto" (em planejamento) = tudo menos Realizada/Cancelada.
const PARTY_DONE = new Set(["Realizada", "Cancelada"]);

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localDateOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null; // "dia inteiro"
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d?: string): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
/** "hoje 22:00" / "12 jul 23:00" / "amanhã" — rótulo curto de quando. */
function whenLabel(iso: string | null, today: string): string {
  if (!iso) return "";
  const d = localDateOf(iso);
  const t = timeOf(iso);
  if (d === today) return t ? `hoje ${t}` : "hoje";
  return t ? `${fmtDate(d ?? undefined)} ${t}` : fmtDate(d ?? undefined);
}

// ── Urgência de prazo (sistema de cor consistente) ──────────────────────────
type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";
/** Dias de calendário até a data (negativo = passou). */
function daysUntil(dateISO: string, today: string): number {
  const a = new Date(`${today}T00:00:00`).getTime();
  const b = new Date(`${dateISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
/** "há 3 dias" / "hoje" / "amanhã" / "em 4 dias" / "em 2 semanas". */
function countdownLabel(dateISO: string | null | undefined, today: string): string {
  if (!dateISO) return "";
  const d = daysUntil(dateISO, today);
  if (d < 0) return `há ${-d} ${-d === 1 ? "dia" : "dias"}`;
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d < 7) return `em ${d} dias`;
  if (d < 14) return "em 1 semana";
  return `em ${Math.round(d / 7)} semanas`;
}
/** Urgência de uma tarefa pela data de vencimento. */
function taskUrgency(startISO: string | null, today: string): Tone {
  const d = localDateOf(startISO);
  if (!d) return "neutral";
  const diff = daysUntil(d, today);
  if (diff < 0) return "danger"; // atrasada
  if (diff <= 2) return "warn"; // vence em breve
  return "neutral";
}
/** Horas até o início da GIG (usa start_time; sem hora assume 20h). */
function hoursUntilGig(meta: GigMeta): number | null {
  if (!meta.date) return null;
  const t = meta.start_time || "20:00";
  return (new Date(`${meta.date}T${t}:00`).getTime() - Date.now()) / 3_600_000;
}
/** Prep pendente: GIG a <48h e checklist não concluído. */
function prepPending(meta: GigMeta): boolean {
  const h = hoursUntilGig(meta);
  if (h == null || h > 48) return false;
  return (meta.prep_done?.length ?? 0) < PREP_TOTAL;
}
/** Índice que muda por dia — pra variar frases sem repetir o mesmo texto fixo. */
function dayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

// Ícone por tipo de compromisso (só ícone — pouco texto, como pedido).
function SourceIcon({ source }: { source: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (source === "gig") return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>;
  if (source === "class") return <svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" /></svg>;
  if (source === "meeting") return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  // task / deadline
  return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
}
// Ícone dos itens "em andamento".
function ComingIcon({ kind }: { kind: "gig" | "track" | "party" }) {
  const p = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "track") return <svg {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M8.5 18V6l11-2v12" /></svg>;
  if (kind === "party") return <svg {...p}><path d="M2 22l5-15 10 10z" /><path d="M14 7a3 3 0 0 0-3-3M17 4a6 6 0 0 0-6-2" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>;
}
function ChevronRight() {
  return <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
}
function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={"u-chip u-" + tone}>{children}</span>;
}

function suggestActivity(items: Agenda[]): string {
  if (items.some((i) => i.source === "gig")) return "Tempo de palco";
  if (items.some((i) => i.source === "class")) return "Aulas";
  return "Gestão";
}

// Frases motivacionais (rodízio por dia — nunca o mesmo texto fixo repetido).
const MOTIVATION = [
  "Comece pequeno: um bloco de foco hoje conta pro seu eu de daqui a um ano.",
  "Consistência vence intensidade. Um passo hoje.",
  "O que você planta agora, toca no palco depois.",
  "Sem pressa e sem pausa. Só siga.",
  "Disciplina é lembrar do que você quer de verdade.",
];
function motivationalLine(streak: number, upcomingCount: number, cold: Cold | null): string {
  if (streak >= 2) return `${streak} dias seguidos de foco — não quebra a corrente hoje.`;
  if (upcomingCount > 0) return `Você tem ${upcomingCount} compromisso${upcomingCount > 1 ? "s" : ""} à frente. Um passo agora encurta a lista.`;
  if (cold) return `Faz tempo que você não fala com ${cold.name.split(" ")[0]}. Um "oi" reaquece.`;
  return MOTIVATION[dayIndex() % MOTIVATION.length];
}

// ── Cache offline do digest ─────────────────────────────────────────────────
type HomeSnapshot = {
  agenda: Agenda[]; cooling: Cold[]; gigs: GigRow[]; tracks: TrackRow[]; parties: PartyRow[];
  streak: number; provocations: string[]; at: number;
};
const CACHE_KEY = "vistage.home.cache";
function saveSnapshot(s: HomeSnapshot) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* cota cheia — ignora */ }
}
function readSnapshot(): HomeSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as HomeSnapshot) : null;
  } catch { return null; }
}

export function Hoje({
  onGoFocus,
  onGoBrainstorm,
  onGoTasks,
}: {
  onGoFocus: () => void;
  onGoBrainstorm: () => void;
  onGoTasks: () => void;
}) {
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [cooling, setCooling] = useState<Cold[]>([]);
  const [coldOpen, setColdOpen] = useState<Cold | null>(null);
  const [gigOpen, setGigOpen] = useState<GigRow | null>(null);
  const [trackOpen, setTrackOpen] = useState<TrackRow | null>(null);
  const [partyOpen, setPartyOpen] = useState<PartyRow | null>(null);
  const [catGigs, setCatGigs] = useState<GigRow[]>([]);
  const [catTracks, setCatTracks] = useState<TrackRow[]>([]);
  const [catParties, setCatParties] = useState<PartyRow[]>([]);
  const [localGigs, setLocalGigs] = useState<LocalGig[]>([]);
  const [provocations, setProvocations] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pull, setPull] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(0);

  const applySnapshot = useCallback((s: HomeSnapshot) => {
    setAgenda(s.agenda); setCooling(s.cooling); setCatGigs(s.gigs);
    setCatTracks(s.tracks); setCatParties(s.parties); setStreak(s.streak);
    setProvocations(s.provocations);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [a, c, g, tr, pa, s, prov] = await Promise.all([
        supabase.from("agenda_mirror").select("id, source, source_id, title, start_at, location").order("start_at", { ascending: true }).limit(60),
        supabase.from("contact_today").select("id, source_id, name, reason, handle").limit(12),
        supabase.from("catalog_mirror").select("source_id, title, meta, search_text").eq("kind", "gig").limit(200),
        supabase.from("catalog_mirror").select("source_id, title, meta").eq("kind", "track").limit(120),
        supabase.from("catalog_mirror").select("source_id, title, meta").eq("kind", "party").limit(120),
        loadStreak(),
        loadProvocations([]),
      ]);
      // Falha total de rede (todas as leituras com erro) → cai no cache.
      if (a.error && c.error && g.error) throw a.error;

      const agendaRows = (a.data ?? []) as Agenda[];
      const coolingRows = (c.data ?? []) as Cold[];
      const gigRows = (g.data ?? []) as GigRow[];
      const trackRows = (tr.data ?? []) as TrackRow[];
      const partyRows = (pa.data ?? []) as PartyRow[];

      setAgenda(agendaRows);
      setCooling(coolingRows);
      setCatGigs(gigRows);
      setCatTracks(trackRows);
      setCatParties(partyRows);
      setStreak(s);
      setProvocations(prov);
      // GIGs criadas no celular ainda não sincronizadas: reconcilia contra o espelho.
      setLocalGigs(
        await reconcileLocalGigs(
          gigRows.map((r) => ({
            date: typeof r.meta?.date === "string" ? r.meta.date : null,
            hay: ((r.search_text ?? r.title) || "").toLowerCase(),
          }))
        )
      );
      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      saveSnapshot({ agenda: agendaRows, cooling: coolingRows, gigs: gigRows, tracks: trackRows, parties: partyRows, streak: s, provocations: prov, at: Date.now() });
    } catch {
      // Sem rede: mostra o último sync (legível offline).
      const snap = readSnapshot();
      if (snap) applySnapshot(snap);
      setOffline(true);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pull-to-refresh no container rolável (.content). Puxar pra baixo no topo
  // re-sincroniza o digest.
  useEffect(() => {
    const scroller = rootRef.current?.closest(".content") as HTMLElement | null;
    if (!scroller) return;
    let startY = 0;
    let pulling = false;
    const setBoth = (v: number) => { pullRef.current = v; setPull(v); };
    const onStart = (e: TouchEvent) => {
      pulling = scroller.scrollTop <= 0;
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY;
      if (dy > 0 && scroller.scrollTop <= 0) {
        e.preventDefault();
        setBoth(Math.min(dy * 0.5, 80));
      } else if (dy <= 0 && pullRef.current > 0) {
        setBoth(0);
      }
    };
    const onEnd = () => {
      if (pulling && pullRef.current >= 60) void load();
      setBoth(0);
      pulling = false;
    };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="center">
        <span className="spinner" />
      </div>
    );
  }

  const today = localToday();

  // GIG de HOJE (variante "dia de GIG") e demais derivações do catálogo.
  const todayGig = catGigs
    .filter((x) => x.meta?.date === today && x.meta.status !== "Cancelada")
    .sort((x, y) => (x.meta.start_time ?? "").localeCompare(y.meta.start_time ?? ""))[0] ?? null;

  // Próximas GIGs (estritamente futuras, não canceladas), mais próximas primeiro.
  // A de hoje já lidera como herói (GigDayHero), então não repete aqui.
  const comingGigs = catGigs
    .filter((x) => typeof x.meta?.date === "string" && x.meta.date! > today && x.meta.status !== "Cancelada")
    .sort((x, y) => (x.meta.date! < y.meta.date! ? -1 : x.meta.date! > y.meta.date! ? 1 : 0))
    .slice(0, 4);
  // Tracks em produção (não concluídas).
  const comingTracks = catTracks.filter((t) => (t.meta?.stage ?? "") !== TRACK_DONE_STAGE).slice(0, 4);
  // Festas em planejamento (em aberto).
  const comingParties = catParties.filter((p) => !PARTY_DONE.has(p.meta?.status ?? "")).slice(0, 4);
  const hasComing = comingGigs.length > 0 || comingTracks.length > 0 || comingParties.length > 0;

  // GIGs pendentes criadas no celular → compromissos sintéticos (aparecem já).
  const localUpcoming: Agenda[] = localGigs
    .filter((g) => !g.date || g.date >= today)
    .map((g) => ({ id: "local:" + g.client_ref, source: "gig", source_id: undefined, title: g.venue_name, start_at: g.date ? `${g.date}T21:00:00` : null, location: g.city }));

  // Compromissos = tarefas atrasadas (topo) + hoje + futuros. Ordena por data
  // ascendente: datas passadas (atrasadas) sobem, depois hoje, depois futuras.
  const commitments = [...localUpcoming, ...agenda]
    .sort((x, y) => {
      const dx = localDateOf(x.start_at) ?? "9999-99-99";
      const dy = localDateOf(y.start_at) ?? "9999-99-99";
      if (dx !== dy) return dx < dy ? -1 : 1;
      return (timeOf(x.start_at) ?? "99") < (timeOf(y.start_at) ?? "99") ? -1 : 1;
    })
    .slice(0, 12);

  const gigById = new Map(catGigs.map((g) => [g.source_id, g]));
  const coldPerson = cooling.find(isPerson) ?? null;
  const overdue = commitments.filter((i) => i.source === "task" && taskUrgency(i.start_at, today) === "danger");

  // Banner de insight: relevante e acionável quando há; senão, motivação.
  const insight: { text: string; tone: Tone; onClick?: () => void } = (() => {
    if (overdue[0]) {
      const o = overdue[0];
      return { text: `Atrasada: ${o.title} · ${countdownLabel(localDateOf(o.start_at), today)}`, tone: "danger", onClick: onGoTasks };
    }
    if (coldPerson) {
      return { text: `Faz tempo que você não fala com ${coldPerson.name.split(" ")[0]}. Um "oi" reaquece.`, tone: "accent", onClick: () => setColdOpen(coldPerson) };
    }
    if (provocations.length > 0) {
      return { text: provocations[dayIndex() % provocations.length], tone: "accent" };
    }
    return { text: motivationalLine(streak, commitments.length, coldPerson), tone: "accent" };
  })();

  function goFocus() {
    try {
      localStorage.setItem("vistage.foco.suggestedActivity", suggestActivity(commitments));
    } catch { /* ok */ }
    onGoFocus();
  }
  function startFocusOnTask(taskId: string, title: string) {
    try {
      localStorage.setItem("vistage.foco.task", JSON.stringify({ id: taskId, title }));
      localStorage.setItem("vistage.foco.suggestedActivity", "Gestão");
    } catch { /* ok */ }
    onGoFocus();
  }

  return (
    <div className="screen today" ref={rootRef}>
      {/* Pull-to-refresh + estado de sync */}
      <div className="pull-ind" style={{ height: pull }}>
        {(pull > 6 || refreshing) && <span className={"spinner sm" + (refreshing ? " on" : "")} style={{ opacity: refreshing ? 1 : Math.min(1, pull / 60) }} />}
      </div>
      <div className="sync-bar">
        <span className={"sync-dot " + (offline ? "off" : "on")} aria-hidden />
        <span className="sync-text">{offline ? "Offline · último sync" : "Sincronizado"}</span>
      </div>

      {/* (1) Streak em destaque — porta de entrada do Modo Foco. */}
      <button className="streak-hero" onClick={goFocus}>
        <span className="streak-hero-flame" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3 3 4.5 4.5 6.5C18 10.5 19 12.4 19 14.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.3 1.3 2.2 2.5 2.2a2.5 2.5 0 0 0 2.5-2.5c0-1.4-.8-2.2-1.3-3.2C10.7 6.3 11 4 12 2z" /></svg>
        </span>
        <span className="streak-hero-body">
          <span className="streak-hero-num">{streak}</span>
          <span className="streak-hero-label">{streak === 1 ? "dia seguido de foco" : "dias seguidos de foco"}</span>
        </span>
        <span className="streak-hero-cta">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
          Focar
        </span>
      </button>

      {/* Variante "dia de GIG" — lidera com a noite. */}
      {todayGig && <GigDayHero gig={todayGig} onFocus={goFocus} />}

      {/* Banner de insight (acionável quando há; senão motivação). */}
      {insight.onClick ? (
        <button className={"insight-banner tone-" + insight.tone} onClick={insight.onClick}>
          <span className="insight-spark" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 6.5L20 11l-6 2.5L12 22l-2-8.5L4 11l6-2.5z" /></svg>
          </span>
          <span className="insight-text">{insight.text}</span>
          <ChevronRight />
        </button>
      ) : (
        <div className={"insight-banner tone-" + insight.tone}>
          <span className="insight-spark" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 6.5L20 11l-6 2.5L12 22l-2-8.5L4 11l6-2.5z" /></svg>
          </span>
          <span className="insight-text">{insight.text}</span>
        </div>
      )}

      {/* (2) O que vem / Em andamento */}
      <section className="home-section">
        <h2 className="section-head">O que vem</h2>
        {!hasComing ? (
          <div className="card empty-card">
            <p className="muted small" style={{ margin: 0 }}>Nada em andamento agora. Que tal prospectar um show ou soltar uma ideia?</p>
            <button className="ghost full" style={{ marginTop: "0.5rem" }} onClick={onGoBrainstorm}>Soltar uma ideia</button>
          </div>
        ) : (
          <div className="coming-wrap">
            {comingGigs.length > 0 && (
              <div className="coming-block">
                <span className="coming-block-label">Próximas GIGs</span>
                {comingGigs.map((g) => {
                  const near = daysUntil(g.meta.date!, today) <= 2;
                  return (
                    <button key={"g" + g.source_id} className="coming-row" onClick={() => setGigOpen(g)}>
                      <span className="coming-ic gig"><ComingIcon kind="gig" /></span>
                      <span className="coming-body">
                        <span className="coming-title">{g.title}</span>
                        {g.meta.city && <span className="coming-sub">{g.meta.city}</span>}
                      </span>
                      <span className="coming-chips">
                        {prepPending(g.meta) && <Chip tone="warn">prep pendente</Chip>}
                        <Chip tone={near ? "warn" : "neutral"}>{countdownLabel(g.meta.date, today)}</Chip>
                      </span>
                      <ChevronRight />
                    </button>
                  );
                })}
              </div>
            )}
            {comingTracks.length > 0 && (
              <div className="coming-block">
                <span className="coming-block-label">Em produção</span>
                {comingTracks.map((t) => (
                  <button key={"t" + t.source_id} className="coming-row" onClick={() => setTrackOpen(t)}>
                    <span className="coming-ic track"><ComingIcon kind="track" /></span>
                    <span className="coming-body">
                      <span className="coming-title">{t.title}</span>
                      {t.meta.project && <span className="coming-sub">{t.meta.project}</span>}
                    </span>
                    <span className="coming-chips">{t.meta.stage && <Chip tone="accent">{t.meta.stage}</Chip>}</span>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            )}
            {comingParties.length > 0 && (
              <div className="coming-block">
                <span className="coming-block-label">Festas em planejamento</span>
                {comingParties.map((p) => (
                  <button key={"p" + p.source_id} className="coming-row" onClick={() => setPartyOpen(p)}>
                    <span className="coming-ic party"><ComingIcon kind="party" /></span>
                    <span className="coming-body">
                      <span className="coming-title">{p.title}</span>
                      {p.meta.date && <span className="coming-sub">{countdownLabel(p.meta.date, today)}</span>}
                    </span>
                    <span className="coming-chips">{p.meta.status && <Chip tone="neutral">{p.meta.status}</Chip>}</span>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* (3) Compromissos — com urgência de prazo */}
      <section className="today-commit">
        <div className="today-commit-head">
          <strong>Compromissos</strong>
          <span className="commit-count">{commitments.length}</span>
        </div>
        {commitments.length === 0 ? (
          <p className="commit-empty">Nada marcado. Bom momento pra agir no que move a carreira.</p>
        ) : (
          <ul className="commit-list">
            {commitments.map((i) => {
              const isTask = i.source === "task";
              const tone: Tone = isTask ? taskUrgency(i.start_at, today) : "neutral";
              const overdueDays = isTask && tone === "danger" ? countdownLabel(localDateOf(i.start_at), today) : null;
              const gig = i.source === "gig" ? gigById.get(i.source_id ?? "") : undefined;
              const tappable = isTask || !!gig;
              const onTap = () => {
                if (isTask) onGoTasks();
                else if (gig) setGigOpen(gig);
              };
              return (
                <li key={i.id} className={"commit-item u-row-" + tone}>
                  {isTask && i.source_id ? (
                    <button
                      type="button"
                      className="commit-play"
                      onClick={() => startFocusOnTask(i.source_id!, i.title)}
                      aria-label={`Focar em ${i.title}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                    </button>
                  ) : (
                    <span className={"commit-ic " + i.source}><SourceIcon source={i.source} /></span>
                  )}
                  {tappable ? (
                    <button type="button" className="commit-title as-link" onClick={onTap}>
                      {i.title}
                      {i.id.startsWith("local:") && <span className="pending-badge">pendente</span>}
                    </button>
                  ) : (
                    <span className="commit-title">
                      {i.title}
                      {i.id.startsWith("local:") && <span className="pending-badge">pendente</span>}
                    </span>
                  )}
                  <span className={"commit-time" + (tone !== "neutral" ? " u-" + tone : "")}>
                    {overdueDays ?? whenLabel(i.start_at, today)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* (4) Relacionamento — esfriando */}
      <section className="home-section">
        <h2 className="section-head">Relacionamento</h2>
        <section className="card">
          <span className="label">Esfriando</span>
          {cooling.length === 0 ? (
            <p className="muted small" style={{ margin: "0.4rem 0 0" }}>Tudo aquecido.</p>
          ) : (
            <ul className="mini-list cold-list">
              {cooling.map((c) => (
                <li key={c.id} className="cold-row">
                  <button type="button" className="cold-tap" onClick={() => setColdOpen(c)}>
                    <span className="cold-ic"><ColdIcon kind={coldKind(c)} /></span>
                    <span className="cold-body">
                      <span className="cold-name">{c.name}</span>
                      {c.reason && <span className="cold-sub">{c.reason}</span>}
                    </span>
                    <ChevronRight />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <NotificationsCard />

      <button className="ghost full" onClick={() => void load()} disabled={refreshing}>
        {refreshing ? "Sincronizando…" : "Atualizar"}
      </button>

      {coldOpen && <ColdSheet item={coldOpen} onClose={() => setColdOpen(null)} />}
      {gigOpen && <GigSheet gig={gigOpen} today={today} onClose={() => setGigOpen(null)} onFocus={() => { setGigOpen(null); goFocus(); }} />}
      {trackOpen && <TrackSheet track={trackOpen} onClose={() => setTrackOpen(null)} />}
      {partyOpen && <PartySheet party={partyOpen} today={today} onClose={() => setPartyOpen(null)} />}
    </div>
  );
}

/** Detalhe do item esfriando (sheet): tipo, há quanto está parado e ação. */
function ColdSheet({ item, onClose }: { item: Cold; onClose: () => void }) {
  const kind = coldKind(item);
  const digits = item.handle ? item.handle.replace(/\D/g, "") : "";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{item.name}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="cold-detail">
          <span className="cold-detail-kind">
            <ColdIcon kind={kind} /> {COLD_KIND_LABEL[kind]}
          </span>
          {item.reason && <p className="muted" style={{ margin: 0 }}>{item.reason}</p>}
          {digits ? (
            <div className="cold-detail-actions">
              <a className="primary full" style={{ marginTop: 0 }} href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
                Reaquecer no WhatsApp
              </a>
              <a className="ghost full" style={{ marginTop: 0 }} href={`tel:${digits}`}>Ligar</a>
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Abra no PC pra retomar de onde parou.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sheet de leitura da GIG (o mobile não tem tela cheia): dados do digest + ações. */
function GigSheet({ gig, today, onClose, onFocus }: { gig: GigRow; today: string; onClose: () => void; onFocus: () => void }) {
  const m = gig.meta;
  const periods = m.set_periods && m.set_periods.length > 0 ? m.set_periods : m.start_time ? [{ start: m.start_time, end: m.end_time ?? "" }] : [];
  const tel = telLink(m.day_contact_phone);
  const wapp = waLink(m.day_contact_phone);
  const map = mapsLink(m.address || m.venue_name || gig.title, m.city);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{gig.title}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="sheet-chips">
          {m.date && <Chip tone={daysUntil(m.date, today) <= 2 ? "warn" : "neutral"}>{countdownLabel(m.date, today)}</Chip>}
          {prepPending(m) && <Chip tone="warn">prep pendente</Chip>}
          {m.status && <Chip tone="accent">{m.status}</Chip>}
        </div>
        <dl className="gig-day-rows">
          {(m.city || m.venue_name) && <div><dt>Local</dt><dd>{[m.venue_name, m.city].filter(Boolean).join(" · ")}</dd></div>}
          {periods.length > 0 && <div><dt>Set</dt><dd>{periods.map((p, i) => `${i ? " · " : ""}${p.start || "?"}${p.end ? `–${p.end}` : ""}`).join("")}</dd></div>}
          {typeof m.cache_amount === "number" && m.cache_amount > 0 && <div><dt>Cachê</dt><dd>{BRL.format(m.cache_amount)}</dd></div>}
          {m.promoter_name && <div><dt>Contratante</dt><dd>{m.promoter_name}</dd></div>}
        </dl>
        {(tel || wapp || map) && (
          <div className="gig-day-actions">
            {tel && <a className="gig-act" href={tel}>Ligar</a>}
            {wapp && <a className="gig-act" href={wapp} target="_blank" rel="noreferrer">WhatsApp</a>}
            {map && <a className="gig-act" href={map} target="_blank" rel="noreferrer">Maps</a>}
          </div>
        )}
        <button className="primary full" style={{ marginTop: "0.2rem" }} onClick={onFocus}>▶ Preparar no Modo Foco</button>
        <p className="muted small" style={{ margin: "0.5rem 0 0" }}>Abra no PC pra editar.</p>
      </div>
    </div>
  );
}

/** Sheet de leitura da track em produção. */
function TrackSheet({ track, onClose }: { track: TrackRow; onClose: () => void }) {
  const m = track.meta;
  const specs = [m.genre, m.bpm ? `${m.bpm} BPM` : null, m.key].filter(Boolean).join(" · ");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{track.title}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="sheet-chips">
          {m.stage && <Chip tone="accent">{m.stage}</Chip>}
          {m.project && <Chip tone="neutral">{m.project}</Chip>}
        </div>
        {specs && <p className="muted small" style={{ margin: "0.2rem 0 0" }}>{specs}</p>}
        {m.concept && <p style={{ margin: "0.6rem 0 0", lineHeight: 1.4 }}>{m.concept}</p>}
        <p className="muted small" style={{ margin: "0.7rem 0 0" }}>Abra no PC pra trabalhar a faixa.</p>
      </div>
    </div>
  );
}

/** Sheet de leitura da festa em planejamento. */
function PartySheet({ party, today, onClose }: { party: PartyRow; today: string; onClose: () => void }) {
  const m = party.meta;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{party.title}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="sheet-chips">
          {m.status && <Chip tone="neutral">{m.status}</Chip>}
          {m.date && <Chip tone={daysUntil(m.date, today) <= 2 ? "warn" : "neutral"}>{countdownLabel(m.date, today)}</Chip>}
        </div>
        <dl className="gig-day-rows">
          {m.date && <div><dt>Data</dt><dd>{fmtDate(m.date)}</dd></div>}
          {m.venue_name && <div><dt>Local</dt><dd>{m.venue_name}</dd></div>}
        </dl>
        <p className="muted small" style={{ margin: "0.5rem 0 0" }}>Abra no PC pra planejar a festa.</p>
      </div>
    </div>
  );
}

/** §4: card-herói do dia de GIG — lidera com a noite (set, cachê, contato, mapa). */
function GigDayHero({ gig, onFocus }: { gig: CatalogGig; onFocus: () => void }) {
  const m = gig.meta;
  const periods =
    m.set_periods && m.set_periods.length > 0
      ? m.set_periods
      : m.start_time
        ? [{ start: m.start_time, end: m.end_time ?? "" }]
        : [];
  const tel = telLink(m.day_contact_phone);
  const wapp = waLink(m.day_contact_phone);
  // Maps no LOCAL: endereço da venue → nome da venue → título; + cidade.
  const map = mapsLink(m.address || m.venue_name || gig.title, m.city);
  const contactFirst = m.day_contact_name ? m.day_contact_name.split(" ")[0] : null;

  return (
    <section className="card gig-day">
      <span className="label">Hoje você toca</span>
      <strong className="gig-day-title">{gig.title}</strong>
      {m.city && <div className="muted gig-day-sub">{m.city}</div>}

      <dl className="gig-day-rows">
        {periods.length > 0 && (
          <div>
            <dt>Set</dt>
            <dd>{periods.map((p, i) => `${i ? " · " : ""}${p.start || "?"}${p.end ? `–${p.end}` : ""}`).join("")}</dd>
          </div>
        )}
        {typeof m.cache_amount === "number" && m.cache_amount > 0 && (
          <div>
            <dt>Cachê</dt>
            <dd>{BRL.format(m.cache_amount)}</dd>
          </div>
        )}
        {m.promoter_name && (
          <div>
            <dt>Contratante</dt>
            <dd>{m.promoter_name}</dd>
          </div>
        )}
      </dl>

      {(tel || wapp || map) && (
        <div className="gig-day-actions">
          {tel && (
            <a className="gig-act" href={tel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              Ligar{contactFirst ? ` · ${contactFirst}` : ""}
            </a>
          )}
          {wapp && (
            <a className="gig-act" href={wapp} target="_blank" rel="noreferrer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              WhatsApp
            </a>
          )}
          {map && (
            <a className="gig-act" href={map} target="_blank" rel="noreferrer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
              Maps
            </a>
          )}
        </div>
      )}

      <button className="gig-day-focus" onClick={onFocus}>
        ▶ Ativar Modo Foco
      </button>
    </section>
  );
}

function NotificationsCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void isPushEnabled().then(setEnabled);
  }, []);

  if (!pushSupported()) {
    return null;
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    const r = await enablePush();
    setBusy(false);
    if (r.ok) {
      setEnabled(true);
      setMsg("Notificações ativadas. Resumo diário às 8h.");
    } else {
      setMsg(r.reason ?? "Não consegui ativar.");
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await sendTestPush();
    setBusy(false);
    setMsg(r.ok ? "Resumo enviado · deve chegar em instantes." : r.reason ?? "Falhou.");
  }

  return (
    <section className="card">
      <div className="row">
        <div>
          <span className="label">Resumo diário + lembretes</span>
          <strong>{enabled == null ? "…" : enabled ? "Ativas" : "Desativadas"}</strong>
        </div>
        <div className="right">
          {enabled ? (
            <button className="ghost" disabled={busy} onClick={() => void test()}>
              {busy ? "…" : "Testar"}
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void enable()}>
              {busy ? "…" : "Ativar"}
            </button>
          )}
        </div>
      </div>
      {msg && <p className="muted stage-sub" style={{ marginBottom: 0, marginTop: "0.5rem" }}>{msg}</p>}
    </section>
  );
}
