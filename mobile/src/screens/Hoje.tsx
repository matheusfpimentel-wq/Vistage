import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabase";
import { loadStreak } from "../identity";
import { reconcileLocalGigs, type LocalGig } from "../localGigs";
import { Estrategia, type StrategyPayload } from "./Estrategia";
import { Carreira, type CareerPayload } from "./Carreira";
import { telLink, waLink, mapsLink } from "../links";
import { localToday, localDateOf, timeOf, fmtDate } from "../lib/dates";
import { EnergyChip } from "../components/EnergyChip";
import { sendCapture } from "../capture";
import { addAcked, readAcked } from "../lib/ackedLocal";
import { haptic } from "../native";
import { Checkin, type Vip } from "./Checkin";
import { GigMediaSheet } from "./GigMediaSheet";

// ── Tipos base ──────────────────────────────────────────────────────────────
// Compromisso (agenda_mirror): GIG/aula/reunião futura + tarefa (inclui atrasada).
type Agenda = { id: string; source: string; source_id?: string; title: string; start_at: string | null; location: string | null };
// "Esfriando": qualquer coisa que o artista alimenta e ficou parada. O tipo vem
// no prefixo do source_id ("contact:"/"fan:"/"track:"/"content:"/"idea:"/"task:").
// Para não-pessoas, `handle` carrega a ATIVIDADE do Modo Foco a abrir; para
// contato/fã, `handle` é o telefone (WhatsApp/ligar).
type Cold = { id: string; source_id: string; name: string; reason: string | null; handle: string | null };
type ColdKind = "contact" | "fan" | "track" | "content" | "idea" | "task";
function coldKind(c: Cold): ColdKind {
  const p = (c.source_id || "").split(":")[0];
  return p === "fan" || p === "track" || p === "content" || p === "idea" || p === "task" ? (p as ColdKind) : "contact";
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
  if (kind === "idea") return <svg {...p}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>;
  if (kind === "task") return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
  return <svg {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
const COLD_KIND_LABEL: Record<ColdKind, string> = { contact: "Contato", fan: "Fã", track: "Faixa", content: "Conteúdo", idea: "Ideia", task: "Tarefa" };

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
  // §2 — pagamento do cachê (card "Cachê · Recebido?").
  payment_status?: string | null;
  cache_pending?: boolean;
  // §1 — lista VIP pro check-in ao vivo.
  vips?: Vip[];
  // Checklist de Preparação (aba Preparação): ids marcados. Alimenta o selo "prep pendente".
  prep_done?: string[];
};
type TrackMeta = { stage?: string | null; project?: string | null; genre?: string | null; bpm?: number | null; key?: string | null; concept?: string | null; deadline?: string | null };
type PartyMeta = { status?: string | null; date?: string | null; venue_name?: string | null };
type ClassMeta = { date?: string | null; status?: string | null; student_name?: string | null; start_time?: string | null; given?: boolean; amount?: number | null };
type ContentMeta = { status?: string | null; format?: string | null; due_date?: string | null; publish_date?: string | null; published_at?: string | null };

type GigRow = { source_id: string; title: string; meta: GigMeta; search_text?: string };
type TrackRow = { source_id: string; title: string; meta: TrackMeta };
type PartyRow = { source_id: string; title: string; meta: PartyMeta };
type ClassRow = { source_id: string; title: string; meta: ClassMeta };
type ContentRow = { source_id: string; title: string; meta: ContentMeta };
type CatalogGig = { title: string; meta: GigMeta };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Total de itens do checklist de Preparação (espelha PREP_GROUPS do Foco: 5+3+5).
const PREP_TOTAL = 13;
// Track já concluída (não entra no "VEM AÍ").
const TRACK_DONE_STAGE = "Pós-lançamento";
// Festa "em aberto" = tudo menos Realizada/Cancelada.
const PARTY_DONE = new Set(["Realizada", "Cancelada"]);
// Conteúdo "em aberto" = tudo menos Publicado/Arquivado.
const CONTENT_DONE = new Set(["Publicado", "Arquivado"]);

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
/** Tom por proximidade de uma data (<=2 dias = âmbar). */
function dateTone(dateISO: string, today: string): Tone {
  return daysUntil(dateISO, today) <= 2 ? "warn" : "neutral";
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

// Ícone por tipo de compromisso (só ícone — pouco texto, como pedido).
function SourceIcon({ source }: { source: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (source === "gig") return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>;
  if (source === "class") return <svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" /></svg>;
  if (source === "meeting") return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  // Bloco de foco da Trilha da semana (relógio).
  if (source === "foco") return <svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" /></svg>;
  // task / deadline
  return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
}
type ComingKind = "gig" | "class" | "party" | "track" | "content";
// Ícone dos itens do "VEM AÍ".
function ComingIcon({ kind }: { kind: ComingKind }) {
  const p = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "track") return <svg {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M8.5 18V6l11-2v12" /></svg>;
  if (kind === "party") return <svg {...p}><path d="M2 22l5-15 10 10z" /><path d="M14 7a3 3 0 0 0-3-3M17 4a6 6 0 0 0-6-2" /></svg>;
  if (kind === "class") return <svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" /></svg>;
  if (kind === "content") return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3V9z" /></svg>;
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

// Prioridade de tipo no "VEM AÍ" (empate de data): GIG > aula > festa > track > conteúdo.
const COMING_PRIORITY: Record<ComingKind, number> = { gig: 0, class: 1, party: 2, track: 3, content: 4 };
type ComingItem = {
  key: string;
  kind: ComingKind;
  date: string;
  title: string;
  sub?: string | null;
  chips: { tone: Tone; label: string }[];
  onTap: () => void;
};

// ── Top 3 do dia (produtividade → ritual de encerramento no desktop) ────────
type Prio = { source_id: string; title: string; done: boolean; sort: number; target_date: string };

// ── Cache offline do digest ─────────────────────────────────────────────────
type HomeSnapshot = {
  agenda: Agenda[]; cooling: Cold[]; gigs: GigRow[]; tracks: TrackRow[]; parties: PartyRow[]; classes: ClassRow[];
  contents?: ContentRow[]; strategy?: StrategyPayload | null; career?: CareerPayload | null;
  ideasCount?: number; tasksCount?: number; top3?: Prio[];
  streak: number; at: number;
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

/** "Bom dia" / "Boa tarde" / "Boa noite" pela hora local. */
function greetingNow(): string {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
/** "terça-feira, 7 de julho" com a primeira letra maiúscula. */
function todayLine(): string {
  const s = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Hoje({
  onGoFocus,
  onGoBrainstorm,
  onGoTasks,
  artistName,
}: {
  onGoFocus: () => void;
  onGoBrainstorm: () => void;
  onGoTasks: () => void;
  artistName?: string | null;
}) {
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [cooling, setCooling] = useState<Cold[]>([]);
  const [coldOpen, setColdOpen] = useState<Cold | null>(null);
  const [gigOpen, setGigOpen] = useState<GigRow | null>(null);
  const [trackOpen, setTrackOpen] = useState<TrackRow | null>(null);
  const [partyOpen, setPartyOpen] = useState<PartyRow | null>(null);
  const [classOpen, setClassOpen] = useState<ClassRow | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [catGigs, setCatGigs] = useState<GigRow[]>([]);
  const [catTracks, setCatTracks] = useState<TrackRow[]>([]);
  const [catParties, setCatParties] = useState<PartyRow[]>([]);
  const [catClasses, setCatClasses] = useState<ClassRow[]>([]);
  const [catContents, setCatContents] = useState<ContentRow[]>([]);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [career, setCareer] = useState<CareerPayload | null>(null);
  const [ideasCount, setIdeasCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [top3all, setTop3] = useState<Prio[]>([]);
  const [stratOpen, setStratOpen] = useState(false);
  const [careerOpen, setCareerOpen] = useState(false);
  const [localGigs, setLocalGigs] = useState<LocalGig[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pull, setPull] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(0);

  const applySnapshot = useCallback((s: HomeSnapshot) => {
    setAgenda(s.agenda); setCooling(s.cooling); setCatGigs(s.gigs);
    setCatTracks(s.tracks); setCatParties(s.parties); setCatClasses(s.classes ?? []);
    setCatContents(s.contents ?? []); setStrategy(s.strategy ?? null); setCareer(s.career ?? null);
    setIdeasCount(s.ideasCount ?? 0); setTasksCount(s.tasksCount ?? 0);
    setTop3(s.top3 ?? []);
    setStreak(s.streak);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [a, c, g, tr, pa, cl, cn, st, ca, idn, tkn, pr, s] = await Promise.all([
        supabase.from("agenda_mirror").select("id, source, source_id, title, start_at, location").order("start_at", { ascending: true }).limit(80),
        supabase.from("contact_today").select("id, source_id, name, reason, handle").limit(120),
        supabase.from("catalog_mirror").select("source_id, title, meta, search_text").eq("kind", "gig").limit(200),
        supabase.from("catalog_mirror").select("source_id, title, meta").eq("kind", "track").limit(120),
        supabase.from("catalog_mirror").select("source_id, title, meta").eq("kind", "party").limit(120),
        supabase.from("catalog_mirror").select("source_id, title, meta").eq("kind", "class").limit(120),
        supabase.from("catalog_mirror").select("source_id, title, meta").eq("kind", "content").limit(120),
        supabase.from("strategy_mirror").select("payload").maybeSingle(),
        supabase.from("career_stats").select("payload").maybeSingle(),
        supabase.from("catalog_mirror").select("*", { count: "exact", head: true }).eq("kind", "idea"),
        supabase.from("tasks_mirror").select("*", { count: "exact", head: true }),
        supabase.from("priorities_mirror").select("source_id, title, done, sort, target_date").eq("scope", "day").order("target_date", { ascending: true }).order("sort", { ascending: true }).limit(30),
        loadStreak(),
      ]);
      // Falha total de rede (todas as leituras com erro) → cai no cache.
      if (a.error && c.error && g.error) throw a.error;

      const agendaRows = (a.data ?? []) as Agenda[];
      const coolingRows = (c.data ?? []) as Cold[];
      const gigRows = (g.data ?? []) as GigRow[];
      const trackRows = (tr.data ?? []) as TrackRow[];
      const partyRows = (pa.data ?? []) as PartyRow[];
      const classRows = (cl.data ?? []) as ClassRow[];
      const contentRows = (cn.data ?? []) as ContentRow[];
      const strategyPayload = (st.data?.payload ?? null) as StrategyPayload | null;
      const careerPayload = (ca.data?.payload ?? null) as CareerPayload | null;
      const nIdeas = idn.count ?? 0;
      const nTasks = tkn.count ?? 0;
      const top3Rows = (pr.data ?? []) as Prio[];

      setAgenda(agendaRows);
      setCooling(coolingRows);
      setCatGigs(gigRows);
      setCatTracks(trackRows);
      setCatParties(partyRows);
      setCatClasses(classRows);
      setCatContents(contentRows);
      setStrategy(strategyPayload);
      setCareer(careerPayload);
      setIdeasCount(nIdeas);
      setTasksCount(nTasks);
      setTop3(top3Rows);
      setStreak(s);
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
      saveSnapshot({ agenda: agendaRows, cooling: coolingRows, gigs: gigRows, tracks: trackRows, parties: partyRows, classes: classRows, contents: contentRows, strategy: strategyPayload, career: careerPayload, ideasCount: nIdeas, tasksCount: nTasks, top3: top3Rows, streak: s, at: Date.now() });
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

  // Refresh global do header (ícone ↻): recarrega o digest desta tela.
  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("vistage:refresh", onRefresh);
    return () => window.removeEventListener("vistage:refresh", onRefresh);
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

  // Top 3 de hoje — montado no ritual de encerramento do desktop (scope='day').
  const top3 = top3all.filter((p) => p.target_date === today).sort((a, b) => a.sort - b.sort).slice(0, 3);

  // GIG de HOJE (variante "dia de GIG").
  const todayGig = catGigs
    .filter((x) => x.meta?.date === today && x.meta.status !== "Cancelada")
    .sort((x, y) => (x.meta.start_time ?? "").localeCompare(y.meta.start_time ?? ""))[0] ?? null;

  // Compromissos = tarefas + reuniões + blocos de foco da Trilha, em ordem
  // cronológica (atrasadas sobem naturalmente). GIGs/aulas moraram pro VEM AÍ.
  const COMMIT_SOURCES = new Set(["task", "meeting", "foco"]);
  const commitments = agenda
    .filter((i) => COMMIT_SOURCES.has(i.source))
    .sort((x, y) => {
      const dx = localDateOf(x.start_at) ?? "9999-99-99";
      const dy = localDateOf(y.start_at) ?? "9999-99-99";
      if (dx !== dy) return dx < dy ? -1 : 1;
      return (timeOf(x.start_at) ?? "99") < (timeOf(y.start_at) ?? "99") ? -1 : 1;
    })
    .slice(0, 14);

  // ── "VEM AÍ": só futuros — músicas em produção, GIGs, festas, aulas e
  // conteúdos, ordenados por data e depois pela prioridade de tipo.
  const coming: ComingItem[] = [];
  for (const g of catGigs) {
    if (typeof g.meta?.date !== "string" || g.meta.date <= today || g.meta.status === "Cancelada") continue;
    const chips: ComingItem["chips"] = [];
    if (prepPending(g.meta)) chips.push({ tone: "warn", label: "prep pendente" });
    chips.push({ tone: dateTone(g.meta.date, today), label: countdownLabel(g.meta.date, today) });
    coming.push({ key: "g" + g.source_id, kind: "gig", date: g.meta.date, title: g.title, sub: g.meta.city, chips, onTap: () => setGigOpen(g) });
  }
  // GIGs criadas no celular ainda não sincronizadas entram como futuras "pendentes".
  for (const g of localGigs) {
    if (g.date && g.date < today) continue;
    coming.push({ key: "lg" + g.client_ref, kind: "gig", date: g.date ?? today, title: g.venue_name, sub: g.city, chips: [{ tone: "warn", label: "pendente" }], onTap: () => {} });
  }
  for (const cl of catClasses) {
    const d = cl.meta?.date;
    if (typeof d !== "string" || d < today || cl.meta.status !== "Agendada") continue;
    coming.push({ key: "c" + cl.source_id, kind: "class", date: d, title: cl.title, sub: cl.meta.student_name, chips: [{ tone: dateTone(d, today), label: countdownLabel(d, today) }], onTap: () => setClassOpen(cl) });
  }
  for (const p of catParties) {
    const d = p.meta?.date;
    if (typeof d !== "string" || d < today || PARTY_DONE.has(p.meta?.status ?? "")) continue;
    const chips: ComingItem["chips"] = [];
    if (p.meta.status) chips.push({ tone: "neutral", label: p.meta.status });
    chips.push({ tone: dateTone(d, today), label: countdownLabel(d, today) });
    coming.push({ key: "p" + p.source_id, kind: "party", date: d, title: p.title, sub: p.meta.venue_name, chips, onTap: () => setPartyOpen(p) });
  }
  for (const t of catTracks) {
    const d = t.meta?.deadline;
    if (typeof d !== "string" || d < today || (t.meta?.stage ?? "") === TRACK_DONE_STAGE) continue;
    const chips: ComingItem["chips"] = [];
    if (t.meta.stage) chips.push({ tone: "accent", label: t.meta.stage });
    chips.push({ tone: dateTone(d, today), label: countdownLabel(d, today) });
    coming.push({ key: "t" + t.source_id, kind: "track", date: d, title: t.title, sub: t.meta.project, chips, onTap: () => setTrackOpen(t) });
  }
  // Conteúdos futuros (publicação/prazo de hoje em diante, ainda não publicados).
  for (const cn of catContents) {
    if (CONTENT_DONE.has(cn.meta?.status ?? "")) continue;
    const d = cn.meta?.publish_date || cn.meta?.due_date;
    if (typeof d !== "string" || d < today) continue;
    const chips: ComingItem["chips"] = [];
    if (cn.meta.status) chips.push({ tone: "neutral", label: cn.meta.status });
    chips.push({ tone: dateTone(d, today), label: countdownLabel(d, today) });
    coming.push({ key: "n" + cn.source_id, kind: "content", date: d, title: cn.title, sub: cn.meta.format, chips, onTap: () => {} });
  }
  coming.sort((x, y) => (x.date !== y.date ? (x.date < y.date ? -1 : 1) : COMING_PRIORITY[x.kind] - COMING_PRIORITY[y.kind]));
  // Músicas em produção SEM prazo completam a grade (são "sendo produzidas").
  const datedKeys = new Set(coming.map((i) => i.key));
  for (const t of catTracks) {
    if (coming.length >= 10) break;
    if ((t.meta?.stage ?? "") === TRACK_DONE_STAGE) continue;
    if (datedKeys.has("t" + t.source_id)) continue;
    if (typeof t.meta?.deadline === "string" && t.meta.deadline < today) continue; // prazo estourado já esfriou
    coming.push({ key: "t" + t.source_id, kind: "track", date: "9999", title: t.title, sub: t.meta?.project, chips: t.meta?.stage ? [{ tone: "accent", label: t.meta.stage }] : [], onTap: () => setTrackOpen(t) });
  }
  const comingTop = coming.slice(0, 10);

  // §4 — cadência de expansão (prefixo expansao:) tem card próprio; o resto é
  // o "Esfriando" de sempre.
  const weekContacts = cooling.filter((c) => c.source_id.startsWith("expansao:"));
  const coldList = cooling.filter((c) => !c.source_id.startsWith("expansao:"));

  // Nº do círculo Estratégia: progresso médio dos OKRs (se houver).
  const okrList = strategy?.okrs ?? [];
  const okrAvg = okrList.length ? Math.round(okrList.reduce((s2, o) => s2 + (o.progress ?? 0), 0) / okrList.length) : null;
  const totalGigs = career?.all_time?.totalGigs ?? catGigs.length;

  function goFocus() {
    try {
      localStorage.setItem("vistage.foco.suggestedActivity", suggestActivity(agenda));
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
  // Esfriando → Modo Foco relacionado (não-pessoas). Tarefa foca a tarefa; os
  // demais abrem o Foco na atividade que veio no `handle` (ex.: Criação musical).
  function openColdFocus(item: Cold) {
    const kind = coldKind(item);
    const idPart = item.source_id.split(":")[1] ?? "";
    setColdOpen(null);
    if (kind === "task") { startFocusOnTask(idPart, item.name); return; }
    try { if (item.handle) localStorage.setItem("vistage.foco.suggestedActivity", item.handle); } catch { /* ok */ }
    onGoFocus();
  }

  // "Deixar esfriar" no celular: MESMA ação do "Deixar esfriar" do PC (some até
  // você tocar no item de novo). Some da lista na hora (otimista) e manda o ack
  // pro desktop aplicar no sync — aí não volta a aparecer nos dois lados.
  async function snoozeCold(c: Cold) {
    setColdOpen(null);
    setCooling((prev) => prev.filter((x) => x.source_id !== c.source_id));
    void haptic("light");
    try {
      await sendCapture("cooling_ack", { ref: c.source_id });
    } catch {
      /* a fila reenvia sozinha */
    }
  }

  return (
    <div className="screen today" ref={rootRef}>
      {/* Pull-to-refresh + estado de sync */}
      <div className="pull-ind" style={{ height: pull }}>
        {(pull > 6 || refreshing) && <span className={"spinner sm" + (refreshing ? " on" : "")} style={{ opacity: refreshing ? 1 : Math.min(1, pull / 60) }} />}
      </div>
      {/* Herói de homepage: data + saudação com o nome do artista. */}
      <header className="home-hero">
        <p className="hero-date">{todayLine()}</p>
        <h1 className="hero-greet">
          {greetingNow()}
          {artistName ? `, ${artistName.split(" ")[0]}` : ""}
        </h1>
      </header>
      <div className="sync-bar">
        <span className={"sync-dot " + (offline ? "off" : "on")} aria-hidden />
        <span className="sync-text">{offline ? "Offline · último sync" : "Sincronizado"}</span>
      </div>

      {/* §3 EMA — pergunta de energia (1 toque, some sozinha fora da janela). */}
      <EnergyChip />

      {/* (1) Fileira de indicadores: círculos com degradê, número embaixo.
          Streak (vermelho) → Foco · Ideias → Brainstorming · Tarefas → Tarefas ·
          Estratégia → página nova · Carreira → página nova. */}
      <div className="stat-circles">
        <button className="stat-circle sc-red" onClick={goFocus} aria-label={`${streak} ${streak === 1 ? "dia" : "dias"} de foco · abrir Modo Foco`}>
          <span className="stat-face">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2c1 3 3 4.5 4.5 6.5C18 10.5 19 12.4 19 14.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.3 1.3 2.2 2.5 2.2a2.5 2.5 0 0 0 2.5-2.5c0-1.4-.8-2.2-1.3-3.2C10.7 6.3 11 4 12 2z" /></svg>
            <span className="stat-num">{streak}</span>
          </span>
          <span className="stat-label">Streak</span>
        </button>
        <button className="stat-circle sc-orange" onClick={onGoBrainstorm} aria-label={`${ideasCount} ideias · abrir Brainstorming`}>
          <span className="stat-face">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>
            <span className="stat-num">{ideasCount}</span>
          </span>
          <span className="stat-label">Ideias</span>
        </button>
        <button className="stat-circle sc-yellow" onClick={onGoTasks} aria-label={`${tasksCount} tarefas pendentes · abrir Tarefas`}>
          <span className="stat-face">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            <span className="stat-num">{tasksCount}</span>
          </span>
          <span className="stat-label">Tarefas</span>
        </button>
        <button className="stat-circle sc-green" onClick={() => setStratOpen(true)} aria-label="Indicadores estratégicos">
          <span className="stat-face">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
            <span className="stat-num">{okrAvg != null ? `${okrAvg}%` : "—"}</span>
          </span>
          <span className="stat-label">Estratégia</span>
        </button>
        <button className="stat-circle sc-blue" onClick={() => setCareerOpen(true)} aria-label={`${totalGigs} GIGs na carreira · abrir Carreira em números`}>
          <span className="stat-face">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M6 2h12v7a6 6 0 0 1-12 0V2z" /><path d="M12 15v3" /><path d="M8 21h8" /><path d="M9 18h6v3H9z" /></svg>
            <span className="stat-num">{totalGigs}</span>
          </span>
          <span className="stat-label">Carreira</span>
        </button>
      </div>

      {/* Variante "dia de GIG" — lidera com a noite. */}
      {todayGig && <GigDayHero gig={todayGig} onFocus={goFocus} onCheckin={() => setCheckinOpen(true)} onMedia={() => setMediaOpen(true)} />}

      {/* (1.5) Top 3 de hoje — prioridades montadas no ritual de encerramento
          (desktop). Read-only aqui: marcar é feito no PC. */}
      {top3.length > 0 && (
        <section className="home-section">
          <h2 className="section-head">Top 3 de hoje</h2>
          <section className="card">
            <ul className="mini-list">
              {top3.map((p, i) => (
                <li key={p.source_id} className="top3-row">
                  <span className={"top3-dot" + (p.done ? " done" : "")} aria-hidden>
                    {p.done ? "✓" : i + 1}
                  </span>
                  <span className={"top3-title" + (p.done ? " done" : "")}>{p.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}

      {/* (2) VEM AÍ — só futuros (músicas em produção, GIGs, festas, aulas,
          conteúdos), em grade de duas colunas. */}
      <section className="home-section">
        <h2 className="section-head">Vem aí</h2>
        {comingTop.length === 0 ? (
          <div className="card empty-card">
            <p className="muted small" style={{ margin: 0 }}>Nada em andamento agora. Que tal prospectar um show ou soltar uma ideia?</p>
            <button className="ghost full" style={{ marginTop: "0.5rem" }} onClick={onGoBrainstorm}>Soltar uma ideia</button>
          </div>
        ) : (
          <div className="coming-grid">
            {comingTop.map((it, i) => (
              <button key={it.key} className={"coming-tile k-" + it.kind} style={{ animationDelay: `${i * 55}ms` }} onClick={it.onTap}>
                <span className={"coming-ic ci-" + it.kind}><ComingIcon kind={it.kind} /></span>
                <span className="coming-title">{it.title}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* (3) Compromissos — com urgência de prazo (inclui atrasadas no topo) */}
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
              const isFoco = i.source === "foco";
              const tone: Tone = isTask ? taskUrgency(i.start_at, today) : "neutral";
              const overdueDays = isTask && tone === "danger" ? countdownLabel(localDateOf(i.start_at), today) : null;
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
                  {isTask || isFoco ? (
                    <button type="button" className="commit-title as-link" onClick={isTask ? onGoTasks : goFocus}>
                      {i.title}
                    </button>
                  ) : (
                    <span className="commit-title">{i.title}</span>
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

      {/* §2 — Dinheiro no momento: aula de hoje dada/paga + cachê a receber */}
      <AulaHojeCard classes={catClasses} today={today} />
      <CacheReceberCard gigs={catGigs} today={today} />

      {/* §4 — Cadência de expansão: contatos mornos da semana (WhatsApp + feito) */}
      <WeekContactsCard items={weekContacts} />

      {/* (4) Relacionamento — esfriando (todas as criações, não só contatos) */}
      <section className="home-section">
        <h2 className="section-head">Esfriando</h2>
        <section className="card">
          {coldList.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>Tudo aquecido.</p>
          ) : (
            <ul className="mini-list cold-list">
              {coldList.map((c) => (
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

      {coldOpen && <ColdSheet item={coldOpen} onClose={() => setColdOpen(null)} onFocus={() => openColdFocus(coldOpen)} onSnooze={() => void snoozeCold(coldOpen)} />}
      {gigOpen && <GigSheet gig={gigOpen} today={today} onClose={() => setGigOpen(null)} onFocus={() => { setGigOpen(null); goFocus(); }} />}
      {trackOpen && <TrackSheet track={trackOpen} onClose={() => setTrackOpen(null)} />}
      {partyOpen && <PartySheet party={partyOpen} today={today} onClose={() => setPartyOpen(null)} />}
      {classOpen && <ClassSheet cls={classOpen} today={today} onClose={() => setClassOpen(null)} />}
      {checkinOpen && todayGig && (
        <Checkin
          gigId={Number(todayGig.source_id)}
          gigTitle={todayGig.title}
          vips={todayGig.meta.vips ?? []}
          onClose={() => setCheckinOpen(false)}
        />
      )}
      {mediaOpen && todayGig && (
        <GigMediaSheet
          gigId={Number.isFinite(Number(todayGig.source_id)) ? Number(todayGig.source_id) : null}
          gigTitle={todayGig.title}
          onClose={() => setMediaOpen(false)}
        />
      )}
      {stratOpen && <Estrategia data={strategy} onClose={() => setStratOpen(false)} />}
      {careerOpen && <Carreira data={career} onClose={() => setCareerOpen(false)} />}
    </div>
  );
}

// §4 — progresso semanal da cadência (persistente por semana, âncora segunda).
const OUTREACH_GOAL = 5;
function outreachWeekKey(): string {
  const d = new Date();
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - mondayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function readOutreachDone(): number {
  try {
    const raw = localStorage.getItem("vistage.outreach.week");
    if (raw) {
      const s = JSON.parse(raw) as { week: string; done: number };
      if (s && s.week === outreachWeekKey() && typeof s.done === "number") return s.done;
    }
  } catch {
    /* semana nova recomeça o contador */
  }
  return 0;
}
function bumpOutreachDone(): number {
  const next = readOutreachDone() + 1;
  try {
    localStorage.setItem("vistage.outreach.week", JSON.stringify({ week: outreachWeekKey(), done: next }));
  } catch {
    /* storage indisponível */
  }
  return next;
}

/** §4 — Contatos da semana: até 5 pessoas de "expansão" pra aquecer, com
 * WhatsApp em 1 toque e "feito" (registra a interação no PC e conta no OKR). */
function WeekContactsCard({ items }: { items: Cold[] }) {
  // "feito" persistido no aparelho: o espelho só some com a pessoa quando o PC
  // ingere a captura — sem persistir, o card reaparecia e um segundo toque
  // duplicava a interação no CRM (e o contador do OKR).
  const [done, setDone] = useState<Set<string>>(() => readAcked("vistage.acked.outreach", 14));
  const [count, setCount] = useState(() => readOutreachDone());

  const remaining = items.filter((c) => !done.has(c.source_id));
  if (remaining.length === 0 && count === 0) return null;

  async function markDone(c: Cold) {
    const pid = Number(c.source_id.split(":")[1] ?? "");
    if (!Number.isFinite(pid)) return; // sem id não há captura — não conta no OKR
    setDone(addAcked("vistage.acked.outreach", c.source_id, 14));
    setCount(bumpOutreachDone());
    void haptic("light");
    try {
      await sendCapture("outreach_done", { person_id: pid });
    } catch {
      /* a fila reenvia sozinha */
    }
  }

  return (
    <section className="home-section">
      <div className="week-head">
        <h2 className="section-head" style={{ margin: 0 }}>Contatos da semana</h2>
        <span className="week-progress">{Math.min(count, OUTREACH_GOAL)}/{OUTREACH_GOAL}</span>
      </div>
      <section className="card">
        {remaining.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Meta da semana batida 👊</p>
        ) : (
          <ul className="mini-list">
            {remaining.map((c) => {
              const wapp = waLink(c.handle);
              return (
                <li key={c.source_id} className="week-row">
                  <span className="week-body">
                    <span className="cold-name">{c.name}</span>
                    {c.reason && <span className="cold-sub">{c.reason}</span>}
                  </span>
                  {wapp && (
                    <a className="week-wa" href={wapp} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${c.name}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                    </a>
                  )}
                  <button className="week-done" onClick={() => void markDone(c)}>feito</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

/** §2 — Cachê a receber: GIGs passadas (até 60 dias) com cachê pendente.
 * "Recebido" move o lançamento pra recebido no PC (payment_received). */
function CacheReceberCard({ gigs, today }: { gigs: GigRow[]; today: string }) {
  // Persistido: até o PC ingerir o payment_received, o espelho ainda lista a
  // GIG como pendente — sem persistir, "Recebido" reaparecia a cada visita.
  const [done, setDone] = useState<Set<string>>(() => readAcked("vistage.acked.cache", 90));
  const items = gigs
    .filter((g) => {
      const d = g.meta?.date;
      if (typeof d !== "string" || d >= today || daysUntil(d, today) < -60) return false;
      if (!(g.meta.cache_pending && (g.meta.cache_amount ?? 0) > 0)) return false;
      return !done.has(g.source_id);
    })
    .slice(0, 6);
  if (items.length === 0) return null;

  async function markReceived(g: GigRow) {
    const gid = Number(g.source_id);
    setDone(addAcked("vistage.acked.cache", g.source_id, 90));
    void haptic("medium");
    try {
      if (Number.isFinite(gid)) await sendCapture("payment_received", { gig_id: gid });
    } catch {
      /* a fila reenvia */
    }
  }

  return (
    <section className="home-section">
      <h2 className="section-head">Cachê a receber</h2>
      <section className="card">
        <ul className="mini-list">
          {items.map((g) => (
            <li key={g.source_id} className="cash-row">
              <span className="cash-body">
                <span className="cold-name">{g.title}</span>
                <span className="cold-sub">{[BRL.format(g.meta.cache_amount ?? 0), fmtDate(g.meta.date)].filter(Boolean).join(" · ")}</span>
              </span>
              <button className="cash-ok" onClick={() => void markReceived(g)}>Recebido</button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/** §2 — Aula de hoje: aulas de hoje já passadas da hora e ainda não dadas.
 * "Dada" / "Dada + paga" registram no PC (class_log). */
function AulaHojeCard({ classes, today }: { classes: ClassRow[]; today: string }) {
  const [done, setDone] = useState<Set<string>>(() => readAcked("vistage.acked.aula", 7));
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const items = classes.filter((c) => {
    if (c.meta?.date !== today || c.meta.status !== "Agendada" || done.has(c.source_id)) return false;
    const st = c.meta.start_time;
    return !st || st <= nowHM; // sem hora, ou já passou da hora
  });
  if (items.length === 0) return null;

  async function log(c: ClassRow, paga: boolean) {
    const cid = Number(c.source_id);
    setDone(addAcked("vistage.acked.aula", c.source_id, 7));
    void haptic("medium");
    try {
      if (Number.isFinite(cid)) await sendCapture("class_log", { class_id: cid, dada: true, paga });
    } catch {
      /* a fila reenvia */
    }
  }

  return (
    <section className="home-section">
      <h2 className="section-head">Aula de hoje</h2>
      <section className="card">
        <ul className="mini-list">
          {items.map((c) => (
            <li key={c.source_id} className="aula-row">
              <span className="cash-body">
                <span className="cold-name">{c.title}</span>
                <span className="cold-sub">{[c.meta.student_name, c.meta.start_time].filter(Boolean).join(" · ")}</span>
              </span>
              <div className="aula-actions">
                <button className="aula-btn" onClick={() => void log(c, false)}>Dada</button>
                <button className="aula-btn aula-paid" onClick={() => void log(c, true)}>Dada + paga</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/** Detalhe do item esfriando (sheet): contato → WhatsApp/ligar; criação → Foco. */
function ColdSheet({ item, onClose, onFocus, onSnooze }: { item: Cold; onClose: () => void; onFocus: () => void; onSnooze: () => void }) {
  const kind = coldKind(item);
  const person = isPerson(item);
  const phone = person ? item.handle : null;
  const wapp = waLink(phone);
  const tel = telLink(phone);
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
          {person ? (
            wapp || tel ? (
              <div className="cold-detail-actions">
                {wapp && (
                  <a className="primary full" style={{ marginTop: 0 }} href={wapp} target="_blank" rel="noreferrer">
                    Reaquecer no WhatsApp
                  </a>
                )}
                {tel && <a className="ghost full" style={{ marginTop: 0 }} href={tel}>Ligar</a>}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>Abra no PC pra retomar de onde parou.</p>
            )
          ) : (
            <button className="primary full" style={{ marginTop: 0 }} onClick={onFocus}>
              ▶ Retomar no Modo Foco{item.handle ? ` · ${item.handle}` : ""}
            </button>
          )}
          <button className="ghost full" style={{ marginTop: 0 }} onClick={onSnooze}>
            Deixar esfriar
          </button>
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
          {m.date && <Chip tone={dateTone(m.date, today)}>{countdownLabel(m.date, today)}</Chip>}
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
          {m.date && <Chip tone={dateTone(m.date, today)}>{countdownLabel(m.date, today)}</Chip>}
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

/** Sheet de leitura da aula. */
function ClassSheet({ cls, today, onClose }: { cls: ClassRow; today: string; onClose: () => void }) {
  const m = cls.meta;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{cls.title}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="sheet-chips">
          {m.date && <Chip tone={dateTone(m.date, today)}>{countdownLabel(m.date, today)}</Chip>}
          {m.status && <Chip tone="neutral">{m.status}</Chip>}
        </div>
        <dl className="gig-day-rows">
          {m.date && <div><dt>Data</dt><dd>{fmtDate(m.date)}</dd></div>}
          {m.student_name && <div><dt>Aluno</dt><dd>{m.student_name}</dd></div>}
        </dl>
        <p className="muted small" style={{ margin: "0.5rem 0 0" }}>Abra no PC pra ver a aula.</p>
      </div>
    </div>
  );
}

/** §4: card-herói do dia de GIG — lidera com a noite (set, cachê, contato, mapa). */
function GigDayHero({ gig, onFocus, onCheckin, onMedia }: { gig: CatalogGig; onFocus: () => void; onCheckin: () => void; onMedia: () => void }) {
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
        <button type="button" className="gig-act" onClick={onMedia}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          Foto/clipe
        </button>
      </div>

      <div className="gig-day-cta">
        <button className="gig-day-checkin" onClick={onCheckin}>Check-in</button>
        <button className="gig-day-focus" onClick={onFocus}>▶ Modo Foco</button>
      </div>
    </section>
  );
}

