import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { clearFocusNotification, showFocusNotification } from "../push";
import { haptic } from "../native";
import { enqueueCapture } from "../queue";
import { waLink } from "../links";
import { localToday } from "../lib/dates";

// Tipos alinhados ao desktop (ActivityType) pra estatística e painel baterem.
// Ordem do menu com dois separadores (— ) entre os grupos. Os valores seguem os
// do desktop ("Aulas"/"Outro") pra não forkar as estatísticas.
const SEP = "__sep__";
const MODE_LAYOUT = [
  "Tempo de palco",
  "Criação musical",
  "Produção de festa",
  "Criação de conteúdo",
  "Aulas",
  SEP,
  "Gestão",
  "Preparação",
  "Estudo",
  "Comunicação",
  SEP,
  "Outro",
];
const ACTIVITIES = MODE_LAYOUT.filter((m) => m !== SEP);

// Atividades que podem se vincular a uma entidade existente (ou não).
const CTX_KIND: Record<string, "track" | "party" | "meeting"> = {
  "Criação musical": "track",
  "Produção de festa": "party",
  Comunicação: "meeting",
};

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtPlanned(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  }
  return `${min}min`;
}

// Dia LOCAL (não UTC): depois das 21h em -03 o toISOString() já virou o dia
// seguinte e a GIG de hoje sumia do picker / virava "No palco" (passada).
function todayISO(): string {
  return localToday();
}

// ── Círculo do foco (anel + play/pause NO CENTRO + contador embaixo) ──────────
// O play e o pause ocupam o MESMO lugar (centro), com ícones de verdade (sem
// emoji). Tocar no círculo alterna iniciar/pausar/retomar. O contador fica
// logo abaixo do ícone (começa em 00:00).
function FocusRing({
  size,
  progress,
  timeLabel,
  subLabel,
  expired,
  paused,
  running,
  onToggle,
}: {
  size: number;
  progress: number | null;
  timeLabel: string;
  subLabel: string;
  expired: boolean;
  paused: boolean;
  running: boolean;
  onToggle: () => void;
}) {
  const stroke = Math.round(size * 0.06);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = progress == null ? 0 : Math.min(1, Math.max(0, progress));
  const dash = circ * clamped;
  const ringColor = expired ? "#f59e0b" : "var(--accent)";

  return (
    <button
      type="button"
      className={"focus-ring" + (running ? " running" : "") + (paused ? " paused" : "")}
      style={{ width: size, height: size }}
      onClick={onToggle}
      aria-label={!running ? "Iniciar foco" : paused ? "Retomar" : "Pausar"}
    >
      <svg width={size} height={size} className="focus-ring-svg">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {progress != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            className={expired ? "focus-ring-prog pulse" : "focus-ring-prog"}
          />
        )}
      </svg>
      <span className="focus-ring-center">
        <span className={"focus-ring-time" + (expired ? " expired" : "")} style={{ fontSize: size * 0.17 }}>
          {timeLabel}
        </span>
        <span className="focus-ring-sub">{subLabel}</span>
      </span>
    </button>
  );
}

// ── Persistência do cronômetro ───────────────────────────────────────────────
// Mantém a sessão viva mesmo se sair da tela ou fechar o app: guarda os marcos
// (timestamps absolutos) no localStorage e recompõe o tempo ao voltar.
const LS_SESSION = "vistage.foco.session";

// Captura ao vivo: marcadores de UM TOQUE durante a sessão. Sem descrição na
// hora (set barulhento) — só categoria + timestamp na sessão; descreve depois.
// O acerto (momento) também ganha subtipo, espelhando o erro (ponto fraco).
type WeakType = "tecnico" | "repertorio" | "postura" | "outra";
type StrongType = "tecnico" | "repertorio" | "postura" | "conexao";
type MarkerKind = "weak" | "moment" | "idea";
type Marker = { id: string; kind: MarkerKind; tipo?: WeakType | StrongType; atMs: number };

const WEAK_TYPES: { key: WeakType; label: string }[] = [
  { key: "tecnico", label: "Técnico" },
  { key: "repertorio", label: "Repertório" },
  { key: "postura", label: "Postura" },
  { key: "outra", label: "Outra" },
];

const STRONG_TYPES: { key: StrongType; label: string }[] = [
  { key: "tecnico", label: "Técnico" },
  { key: "repertorio", label: "Repertório" },
  { key: "postura", label: "Postura" },
  { key: "conexao", label: "Conexão" },
];

// ── Ícones inline (padrão dos vizinhos: viewBox 0 0 24 24, stroke currentColor,
// strokeWidth 2, linecap/linejoin round). Sem libs, sem emoji. ───────────────
const MK = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
/** ERRO — AlertCircle (círculo + linha vertical + ponto). */
function IcAlert({ size = 24 }: { size?: number }) {
  return (
    <svg {...MK} width={size} height={size} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}
/** ACERTO — Flame (chama). */
function IcFlame({ size = 24 }: { size?: number }) {
  return (
    <svg {...MK} width={size} height={size} aria-hidden>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
/** IDEIA — Lightbulb (lâmpada). */
function IcBulb({ size = 24 }: { size?: number }) {
  return (
    <svg {...MK} width={size} height={size} aria-hidden>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
    </svg>
  );
}
/** CHECK — marcar item da preparação. */
function IcCheck({ size = 24 }: { size?: number }) {
  return (
    <svg {...MK} width={size} height={size} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
/** STOP — quadrado (encerrar sessão). */
function IcStop({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}
function IcPlay({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IcPause({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

type Persisted = {
  startedAtMs: number;
  pauseOffsetMs: number;
  pausedAtMs: number | null;
  activity: string;
  plannedStr: string;
  sessionId: string | null;
  markers: Marker[];
  // GIG/vínculo escolhidos no picker: sem eles, o restore voltava pro padrão
  // (a GIG mais próxima) e o debrief podia ir pra GIG ERRADA.
  stageGigId?: number | null;
  ctxId?: number | null;
};
function loadSession(): Persisted | null {
  try {
    const v = localStorage.getItem(LS_SESSION);
    return v ? (JSON.parse(v) as Persisted) : null;
  } catch {
    return null;
  }
}
function saveSession(p: Persisted) {
  try {
    localStorage.setItem(LS_SESSION, JSON.stringify(p));
  } catch {
    /* storage cheio/indisponível */
  }
}
function clearSession() {
  try {
    localStorage.removeItem(LS_SESSION);
  } catch {
    /* ok */
  }
}

// ── Painel: PALCO ────────────────────────────────────────────────────────────
type StageSlot = { start: string; end: string };
type GigMeta = {
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
  city?: string | null;
  status?: string | null;
  promoter_name?: string | null;
  day_contact_name?: string | null;
  day_contact_phone?: string | null;
  set_periods?: StageSlot[];
  ideas?: string[];
  /** Itens do checklist de Preparação (da aba Preparação) já marcados. */
  prep_done?: string[];
  /** Objetivos da GIG (aba Briefing) pro card de objetivos no palco. */
  main_goal?: string | null;
  opportunities?: string | null;
  concrete_goals?: string[];
  targets?: string[];
};

// Checklist de Preparação — estrutura FIXA, espelha PREP_GROUPS do desktop
// (src/modules/gigs/prep.ts). O estado (marcados) vem por meta.prep_done.
const PREP_GROUPS: { id: string; title: string; items: { id: string; label: string }[] }[] = [
  {
    id: "musical",
    title: "Preparação Musical",
    items: [
      { id: "set-analisado", label: "Set analisado" },
      { id: "tagging", label: "Tagging" },
      { id: "hot-cues", label: "Hot cues" },
      { id: "set-exportado", label: "Set exportado" },
      { id: "rider-confirmado", label: "Rider confirmado" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    items: [
      { id: "flyers-recebidos", label: "Flyers e mídias recebidos" },
      { id: "stories-publicado", label: "Stories publicado" },
      { id: "fas-acionados", label: "Fãs acionados" },
    ],
  },
  {
    id: "logistica",
    title: "Logística",
    items: [
      { id: "equip-carregados", label: "Equipamentos carregados (fone, Phase, powerbank)" },
      { id: "backup-separado", label: "Backup separado" },
      { id: "timetable-recebida", label: "Timetable recebida" },
      { id: "outfit-escolhido", label: "Outfit escolhido" },
      { id: "check-equipamentos", label: "Check geral de equipamentos" },
    ],
  },
];
type StageGig = { title: string } & GigMeta;
/** GIG candidata no Modo Foco (palco/preparação): id + título + meta do espelho. */
type StageGigOption = { id: number; title: string; meta: GigMeta };

// Palco vincula a GIGs CONFIRMADAS; preparação também aceita PROPOSTAS. ("A
// Caminho" conta como confirmada — é o status do dia da GIG.)
const STAGE_CONFIRMED = ["Confirmada", "A Caminho"];

/** GIGs elegíveis pro modo, viram as opções do picker (padrão = a mais próxima).
    Palco: QUALQUER confirmada, mesmo com a data já passada — útil no atraso de
    entrada (vira o dia seguinte e a GIG ainda é "a de ontem"); ordena pela
    proximidade de hoje. Preparação: só futuras (confirmadas ou propostas). */
function eligibleStageGigs(
  rows: { source_id: string; title: string; meta: GigMeta }[],
  activity: string
): StageGigOption[] {
  const today = todayISO();
  const isPrep = activity === "Preparação";
  const todayMs = Date.parse(`${today}T00:00:00`);
  const list = rows
    .map((r) => ({ id: Number(r.source_id), title: r.title, meta: (r.meta ?? {}) as GigMeta }))
    .filter((g) => {
      if (!Number.isFinite(g.id)) return false;
      const d = g.meta.date;
      if (typeof d !== "string") return false;
      if (isPrep && d < today) return false; // preparar é pro que está por vir
      const st = g.meta.status ?? "";
      if (STAGE_CONFIRMED.includes(st)) return true;
      return isPrep && st === "Proposta";
    });
  if (isPrep) {
    // Preparação: mais próxima primeiro (todas futuras).
    return list.sort((a, b) => {
      const da = a.meta.date ?? "", db = b.meta.date ?? "";
      return da < db ? -1 : da > db ? 1 : (a.meta.start_time ?? "").localeCompare(b.meta.start_time ?? "");
    });
  }
  // Palco: pela proximidade de hoje; em empate, a futura antes da passada.
  return list.sort((a, b) => {
    const ka = Math.abs(Date.parse(`${a.meta.date}T00:00:00`) - todayMs);
    const kb = Math.abs(Date.parse(`${b.meta.date}T00:00:00`) - todayMs);
    if (ka !== kb) return ka - kb;
    const af = (a.meta.date ?? "") >= today ? 0 : 1;
    const bf = (b.meta.date ?? "") >= today ? 0 : 1;
    if (af !== bf) return af - bf;
    return (a.meta.start_time ?? "").localeCompare(b.meta.start_time ?? "");
  });
}

function fmtDate(d?: string): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function StagePanel({ option, loading }: { option: StageGigOption | null; loading: boolean }) {
  if (loading) return <p className="muted center-text">Carregando GIGs…</p>;
  if (!option) return <p className="muted center-text">Sem GIG confirmada à frente: o debrief vira uma GIG no PC ao revisar.</p>;
  const gig: StageGig = { title: option.title, ...option.meta };

  const periods = gig.set_periods && gig.set_periods.length > 0
    ? gig.set_periods
    : gig.start_time
      ? [{ start: gig.start_time, end: gig.end_time ?? "" }]
      : [];
  const wa = waLink(gig.day_contact_phone);
  const concretos = gig.concrete_goals ?? [];
  const alvos = gig.targets ?? [];
  const hasGoals = !!(gig.main_goal || gig.opportunities || concretos.length || alvos.length);

  return (
    <>
    <section className="card stage">
      <span className="label">{gig.date && gig.date < todayISO() ? "No palco" : gig.date === todayISO() ? "Hoje no palco" : "Próximo palco"}</span>
      <strong className="stage-title">{gig.title}</strong>
      <div className="muted stage-sub">{[fmtDate(gig.date), gig.city].filter(Boolean).join(" · ")}</div>
      <dl className="detail-rows stage-rows">
        {periods.length > 0 && (
          <div>
            <dt>Set</dt>
            <dd>
              {periods.map((p, i) => (
                <span key={i}>
                  {i > 0 ? " · " : ""}
                  {p.start || "?"}
                  {p.end ? `–${p.end}` : ""}
                </span>
              ))}
            </dd>
          </div>
        )}
        {gig.day_contact_name && (
          <div>
            <dt>Contato do dia</dt>
            <dd>
              {wa ? (
                <a className="link" href={wa} target="_blank" rel="noreferrer">
                  {gig.day_contact_name} · WhatsApp
                </a>
              ) : (
                gig.day_contact_name
              )}
            </dd>
          </div>
        )}
        {gig.promoter_name && (
          <div>
            <dt>Contratante</dt>
            <dd>{gig.promoter_name}</dd>
          </div>
        )}
      </dl>
      {gig.ideas && gig.ideas.length > 0 && (
        <>
          <span className="label" style={{ marginTop: "0.6rem", display: "block" }}>
            Ideias de música
          </span>
          <ul className="focus-ideas">
            {gig.ideas.map((idea, i) => (
              <li key={i}>{idea}</li>
            ))}
          </ul>
        </>
      )}
    </section>

    {hasGoals && (
      <section className="card stage-goals">
        <span className="label">Objetivos</span>
        {gig.main_goal && (
          <div className="goal-block">
            <span className="goal-h">Objetivo principal</span>
            <p className="goal-text">{gig.main_goal}</p>
          </div>
        )}
        {gig.opportunities && (
          <div className="goal-block">
            <span className="goal-h">Oportunidades</span>
            <p className="goal-text">{gig.opportunities}</p>
          </div>
        )}
        {(concretos.length > 0 || alvos.length > 0) && (
          <div className="goal-cols">
            <div className="goal-col">
              <span className="goal-h">Concretos</span>
              {concretos.length > 0 ? (
                <ul className="goal-list">{concretos.map((g, i) => <li key={i}>{g}</li>)}</ul>
              ) : (
                <span className="muted small" />
              )}
            </div>
            <div className="goal-col">
              <span className="goal-h">Alvos</span>
              {alvos.length > 0 ? (
                <ul className="goal-list">{alvos.map((t, i) => <li key={i}>{t}</li>)}</ul>
              ) : (
                <span className="muted small" />
              )}
            </div>
          </div>
        )}
      </section>
    )}
    </>
  );
}

// ── Painel: MÚSICA (conceito de uma faixa em produção) ───────────────────────
type TrackMeta = { stage?: string | null; concept?: string | null; project?: string | null };

function MusicPanel() {
  const [track, setTrack] = useState<{ title: string; meta: TrackMeta } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase
      .from("catalog_mirror")
      .select("title, meta")
      .eq("kind", "track")
      .limit(40)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as { title: string; meta: TrackMeta }[];
        const withConcept = rows.find((r) => r.meta?.concept && r.meta.concept.trim());
        setTrack(withConcept ?? rows[0] ?? null);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded || !track) return null;
  return (
    <section className="card">
      <span className="label">Conceito da faixa</span>
      <strong className="stage-title">{track.title}</strong>
      {track.meta?.stage && <div className="muted stage-sub">{track.meta.stage}</div>}
      {track.meta?.concept ? (
        <p className="focus-concept">{track.meta.concept}</p>
      ) : (
        <p className="muted">Sem conceito anotado para esta faixa.</p>
      )}
    </section>
  );
}

// ── Painel: GESTÃO (tarefas pendentes pra tickar) ────────────────────────────
type MirrorTask = { source_id: string; title: string; priority: string | null; due_date: string | null };

type SubItem = { id: number; title: string; done: boolean };

function GestaoPanel({ focusTask }: { focusTask: { id: string; title: string } | null }) {
  const [tasks, setTasks] = useState<MirrorTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  // Checklist da tarefa em foco (vem do `meta` do catálogo) + ticks otimistas.
  const [checklist, setChecklist] = useState<SubItem[] | null>(null);
  const [subDone, setSubDone] = useState<Record<number, boolean>>({});

  // Sem tarefa em foco → lista as pendentes pra tickar (comportamento padrão).
  useEffect(() => {
    if (focusTask) return;
    let active = true;
    void supabase
      .from("tasks_mirror")
      .select("source_id, title, priority, due_date")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return;
        setTasks((data ?? []) as MirrorTask[]);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [focusTask]);

  // Com tarefa em foco → puxa o checklist dela do catálogo.
  useEffect(() => {
    if (!focusTask) return;
    let active = true;
    void supabase
      .from("catalog_mirror")
      .select("meta")
      .eq("kind", "task")
      .eq("source_id", focusTask.id)
      .limit(1)
      .then(({ data }) => {
        if (!active) return;
        const meta = (data?.[0]?.meta ?? {}) as { checklist?: SubItem[] };
        setChecklist(meta.checklist ?? []);
      });
    return () => {
      active = false;
    };
  }, [focusTask]);

  async function tick(t: MirrorTask) {
    setDone((d) => new Set(d).add(t.source_id)); // some na hora (otimista)
    await enqueueCapture("task_done", { task_id: Number(t.source_id), title: t.title });
  }

  async function tickSub(s: SubItem) {
    const next = !(subDone[s.id] ?? s.done);
    setSubDone((d) => ({ ...d, [s.id]: next }));
    await enqueueCapture("subtask_done", { subtask_id: s.id, done: next ? 1 : 0 });
  }

  // ── Tarefa em foco: título + checklist dela (itens tickáveis) ──────────────
  if (focusTask) {
    return (
      <section className="card">
        <span className="label">Tarefa em foco</span>
        <strong className="stage-title">{focusTask.title}</strong>
        {checklist === null ? (
          <p className="muted" style={{ marginTop: "0.4rem" }}>Carregando checklist…</p>
        ) : checklist.length === 0 ? (
          <p className="muted" style={{ marginTop: "0.4rem" }}>Sem checklist nesta tarefa.</p>
        ) : (
          <ul className="focus-tasks">
            {checklist.map((s) => {
              const isDone = subDone[s.id] ?? s.done;
              return (
                <li key={s.id}>
                  <button type="button" className="focus-task" onClick={() => void tickSub(s)}>
                    <span className={"focus-task-box" + (isDone ? " checked" : "")} aria-hidden />
                    <span className={"focus-task-title" + (isDone ? " sub-done" : "")}>{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
          Marcar aqui atualiza no PC na próxima sincronização.
        </p>
      </section>
    );
  }

  // ── Sem tarefa em foco: pendentes pra tickar ───────────────────────────────
  if (!loaded) return null;
  const visible = tasks.filter((t) => !done.has(t.source_id));
  if (visible.length === 0) {
    return <p className="muted center-text">Sem tarefas pendentes.</p>;
  }
  return (
    <section className="card">
      <span className="label">Tarefas pendentes</span>
      <ul className="focus-tasks">
        {visible.map((t) => (
          <li key={t.source_id}>
            <button type="button" className="focus-task" onClick={() => void tick(t)}>
              <span className="focus-task-box" aria-hidden />
              <span className="focus-task-title">{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
        Concluir aqui marca no PC na próxima sincronização.
      </p>
    </section>
  );
}

// ── Painel: PREPARAÇÃO (checklist estruturado da aba Preparação da GIG) ───────
// Os grupos/itens são fixos (PREP_GROUPS); o que está marcado vem de
// meta.prep_done. Tocar um item alterna e manda uma captura prep_check.
function PreparacaoPanel({ gig, loading, done, onTick }: {
  gig: StageGigOption | null;
  loading: boolean;
  done: Set<string>;
  onTick: (itemId: string, label: string) => void;
}) {
  if (loading) return <p className="muted center-text">Carregando GIGs…</p>;
  if (!gig) return <p className="muted center-text">Sem GIG confirmada ou proposta à frente pra preparar.</p>;
  return (
    <section className="card">
      <span className="label">Preparar: {gig.title}</span>
      {PREP_GROUPS.map((grp) => {
        const total = grp.items.length;
        const doneCount = grp.items.filter((it) => done.has(it.id)).length;
        return (
          <div key={grp.id} className="prep-group">
            <div className="prep-group-head">
              <span className="prep-group-title">{grp.title}</span>
              <span className="prep-group-count">{doneCount}/{total}</span>
            </div>
            <ul className="focus-tasks">
              {grp.items.map((it) => {
                const isDone = done.has(it.id);
                return (
                  <li key={it.id}>
                    <button type="button" className="focus-task" onClick={() => onTick(it.id, it.label)}>
                      <span className={"focus-task-box" + (isDone ? " checked" : "")} aria-hidden />
                      <span className={"focus-task-title" + (isDone ? " sub-done" : "")}>{it.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
        Marcar aqui atualiza no PC na próxima sincronização.
      </p>
    </section>
  );
}

// Captura ao vivo no Modo Foco → PREPARAÇÃO: nada de erro/momento (isso é palco).
// Só uma lâmpada (insight → Observações da aba Preparação) e um Check pra marcar
// um item do checklist, escolhido ao clicar.
function PrepLiveCapture({ gig, done, onTick }: {
  gig: StageGigOption | null;
  done: Set<string>;
  onTick: (itemId: string, label: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [pickOpen, setPickOpen] = useState(false);

  function saveNote() {
    const t = noteText.trim();
    if (t && gig) void enqueueCapture("prep_note", { gig_id: gig.id, note: t });
    setNoteText("");
    setNoteOpen(false);
    void haptic("light");
  }
  const undone = PREP_GROUPS.flatMap((g) => g.items).filter((it) => !done.has(it.id));

  return (
    <section className="live-capture">
      <span className="label">Preparação ao vivo</span>
      <div className="lc-round-row lc-prep">
        <button
          type="button"
          className="glass-round lc-round lc-round-idea"
          onClick={() => setNoteOpen(true)}
          aria-label="Anotar observação de preparação"
        >
          <IcBulb />
        </button>
        <button
          type="button"
          className="glass-round lc-round lc-round-check"
          onClick={() => setPickOpen(true)}
          disabled={!gig}
          aria-label="Marcar item do checklist"
        >
          <IcCheck />
        </button>
      </div>

      {noteOpen && (
        <div className="lc-fan-overlay" onClick={() => setNoteOpen(false)}>
          <div className="lc-idea-box" onClick={(e) => e.stopPropagation()}>
            <span className="label">Observação da preparação</span>
            <textarea
              autoFocus
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Anota a observação (curtinho)…"
            />
            <div className="lc-idea-actions">
              <button type="button" className="ghost" onClick={() => { setNoteText(""); setNoteOpen(false); }}>
                Cancelar
              </button>
              <button type="button" className="primary" onClick={saveNote}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {pickOpen && (
        <div className="lc-fan-overlay" onClick={() => setPickOpen(false)}>
          <div className="lc-idea-box lc-pick-box" onClick={(e) => e.stopPropagation()}>
            <span className="label">Marcar item da preparação</span>
            {undone.length === 0 ? (
              <p className="muted small" style={{ margin: "0.3rem 0" }}>Tudo marcado! 🎉</p>
            ) : (
              <ul className="focus-tasks">
                {undone.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      className="focus-task"
                      onClick={() => { onTick(it.id, it.label); setPickOpen(false); }}
                    >
                      <span className="focus-task-box" aria-hidden />
                      <span className="focus-task-title">{it.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="lc-idea-actions">
              <button type="button" className="ghost" onClick={() => setPickOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ContextPanel({ activity, focusTask, stageGig, stageLoading, prepDone, onTickPrep }: { activity: string; focusTask: { id: string; title: string } | null; stageGig: StageGigOption | null; stageLoading: boolean; prepDone: Set<string>; onTickPrep: (itemId: string, label: string) => void }) {
  if (activity === "Preparação") return <PreparacaoPanel gig={stageGig} loading={stageLoading} done={prepDone} onTick={onTickPrep} />;
  if (activity === "Tempo de palco") return <StagePanel option={stageGig} loading={stageLoading} />;
  if (activity === "Criação musical") return <MusicPanel />;
  if (activity === "Gestão") return <GestaoPanel focusTask={focusTask} />;
  return null;
}

/** Picker das GIGs futuras elegíveis (palco: confirmadas; preparação: também
    propostas). Mostra todas como opção abaixo na tela — o usuário escolhe a qual
    vincular o palco/preparação; o padrão é a mais próxima. */
function StageGigPicker({
  options,
  selectedId,
  onSelect,
  activity,
  loading,
}: {
  options: StageGigOption[];
  selectedId: number | null;
  onSelect: (o: StageGigOption) => void;
  activity: string;
  loading: boolean;
}) {
  if (loading) return null;
  if (options.length === 0) return null; // a mensagem de "sem GIG" vem do painel
  return (
    <div className="gig-picker">
      <span className="label">{activity === "Preparação" ? "Preparar para" : "Tocar em"}</span>
      <div className="gig-picker-list">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`gig-opt${o.id === selectedId ? " active" : ""}`}
            onClick={() => onSelect(o)}
          >
            <span className="gig-opt-title">{o.title}</span>
            <span className="gig-opt-sub">
              {[fmtDate(o.meta.date), o.meta.status, o.meta.city].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Vínculo opcional (track/festa/reunião) do Modo Foco ──────────────────────
type CtxOption = { id: number; title: string; sub: string };

/** Subtítulo do item vinculável, conforme o tipo. */
function ctxSub(kind: "track" | "party" | "meeting", meta: Record<string, unknown>): string {
  const g = (k: string): string => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  if (kind === "track") return [g("stage"), g("project")].filter(Boolean).join(" · ");
  return [fmtDate(g("date")), g("status"), g("location")].filter(Boolean).join(" · ");
}

/** Picker de vínculo: "Sem vínculo" + as entidades do catálogo (recentes primeiro). */
function ContextPicker({ label, noneLabel, options, selectedId, onSelect, loading }: {
  label: string;
  noneLabel: string;
  options: CtxOption[];
  selectedId: number | null;
  onSelect: (o: CtxOption | null) => void;
  loading: boolean;
}) {
  if (loading) return null;
  return (
    <div className="gig-picker">
      <span className="label">{label}</span>
      <div className="gig-picker-list">
        <button type="button" className={`gig-opt${selectedId == null ? " active" : ""}`} onClick={() => onSelect(null)}>
          <span className="gig-opt-title">{noneLabel}</span>
        </button>
        {options.map((o) => (
          <button key={o.id} type="button" className={`gig-opt${o.id === selectedId ? " active" : ""}`} onClick={() => onSelect(o)}>
            <span className="gig-opt-title">{o.title}</span>
            {o.sub && <span className="gig-opt-sub">{o.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Captura ao vivo (grid eyes-free + ideia/momento) ─────────────────────────
/** mm:ss do instante DENTRO da sessão (pra mostrar quando no set marcou). */
function fmtAt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Captura ao vivo eyes-free: 3 botões REDONDOS de vidro à direita do timer —
 * ERRO, ACERTO, IDEIA (ícones SVG, sem emoji). ERRO/ACERTO abrem um LEQUE
 * RADIAL com os 4 subtipos; IDEIA é toque único. Um toque marca com timestamp
 * e haptic; a descrição vem no debrief/PC.
 *
 * Geometria do leque: a linha de botões fica EMBAIXO do relógio (centralizada),
 * então o arco abre pra CIMA. Em vez de DESLOCAR o leque pra caber (o que
 * desencostava o leque do botão), ele INCLINA pra dentro da tela conforme a
 * posição do botão: o de erro (mais à esquerda) abre puxado pra direita, o do
 * meio abre reto pra cima. Assim o leque sai exatamente do botão E os itens nunca
 * cortam na borda. Ângulos no sentido horário a partir das 3h, com Y pra baixo
 * (270° = pra cima).
 */
const FAN_RADIUS = 112; // distância do centro do botão até cada item do leque
const FAN_SPAN = 104; // abertura do leque, em graus

/** Faixa angular do leque, inclinada pra DENTRO da tela conforme o x do botão. */
function fanRange(originX: number): { start: number; end: number } {
  const w = typeof window !== "undefined" ? window.innerWidth : 390;
  const frac = Math.min(1, Math.max(0, originX / w)); // 0 = esquerda · 1 = direita
  const center = 270 + (0.5 - frac) * 90; // 270 = pra cima; inclina até ±45°
  return { start: center - FAN_SPAN / 2, end: center + FAN_SPAN / 2 };
}

/** Posição (x,y) de um item do leque, relativa ao centro do botão. */
function fanOffset(i: number, total: number, startDeg: number, endDeg: number): { x: number; y: number } {
  const t = total <= 1 ? 0 : i / (total - 1);
  const deg = startDeg + (endDeg - startDeg) * t;
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * FAN_RADIUS, y: Math.sin(rad) * FAN_RADIUS };
}

type FanKind = "weak" | "moment";

function LiveCapture({ markers, onMark }: { markers: Marker[]; onMark: (k: MarkerKind, t?: WeakType | StrongType, note?: string) => void }) {
  // Qual leque está aberto (null = fechado) + de ONDE ele abre (centro do botão
  // tocado), pra o leque sair da mesma posição do botão original.
  const [fan, setFan] = useState<FanKind | null>(null);
  const [fanOrigin, setFanOrigin] = useState<{ x: number; y: number } | null>(null);
  // A lâmpada abre um campo curtinho pra uma breve nota da ideia.
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaText, setIdeaText] = useState("");
  const count = (pred: (m: Marker) => boolean) => markers.filter(pred).length;
  const errors = count((m) => m.kind === "weak");
  const hits = count((m) => m.kind === "moment");
  const ideas = count((m) => m.kind === "idea");

  // Seleciona um subtipo no leque: marca + fecha (o haptic vem do onMark).
  function pick(tipo: WeakType | StrongType) {
    if (!fan) return;
    onMark(fan, tipo);
    setFan(null);
  }

  // Salva a ideia com a breve nota (ou sem, se vazia) e fecha o campo.
  function saveIdea() {
    onMark("idea", undefined, ideaText.trim() || undefined);
    setIdeaText("");
    setIdeaOpen(false);
  }

  const options = fan === "weak" ? WEAK_TYPES : STRONG_TYPES;
  // Faixa do leque inclinada conforme a posição do botão (fanOrigin garantido no render).
  const fanDeg = fanOrigin ? fanRange(fanOrigin.x) : { start: 270 - FAN_SPAN / 2, end: 270 + FAN_SPAN / 2 };

  return (
    <section className="live-capture">
      <span className="label">Ao vivo</span>
      <div className="lc-round-row">
        <button
          type="button"
          className="glass-round lc-round lc-round-err"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setFanOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            setFan((f) => (f === "weak" ? null : "weak"));
          }}
          aria-label={`Registrar erro${errors ? ` (${errors} nesta sessão)` : ""}`}
          aria-expanded={fan === "weak"}
        >
          <IcAlert />
          {errors > 0 && <span className="lc-badge">×{errors}</span>}
        </button>
        <button
          type="button"
          className="glass-round lc-round lc-round-hit"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setFanOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            setFan((f) => (f === "moment" ? null : "moment"));
          }}
          aria-label={`Registrar acerto${hits ? ` (${hits} nesta sessão)` : ""}`}
          aria-expanded={fan === "moment"}
        >
          <IcFlame />
          {hits > 0 && <span className="lc-badge">×{hits}</span>}
        </button>
        <button
          type="button"
          className="glass-round lc-round lc-round-idea"
          onClick={() => setIdeaOpen(true)}
          aria-label={`Anotar ideia${ideas ? ` (${ideas} nesta sessão)` : ""}`}
        >
          <IcBulb />
          {ideas > 0 && <span className="lc-badge">×{ideas}</span>}
        </button>
      </div>

      {/* Leque radial: abre DA POSIÇÃO do botão tocado (fanOrigin), com o fundo
          embaçado por trás. Tocar fora fecha; o botão central também alterna. */}
      {fan && fanOrigin && (
        <div className="lc-fan-overlay" onClick={() => setFan(null)}>
          <div
            className={"lc-fan lc-fan-" + fan}
            style={{ left: fanOrigin.x, top: fanOrigin.y }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label={fan === "weak" ? "Tipo de erro" : "Tipo de acerto"}
          >
            <button
              type="button"
              className={"glass-round lc-fan-center " + (fan === "weak" ? "lc-round-err" : "lc-round-hit")}
              onClick={() => setFan(null)}
              aria-label="Fechar"
            >
              {fan === "weak" ? <IcAlert /> : <IcFlame />}
            </button>
            {options.map((o, i) => {
              const { x, y } = fanOffset(i, options.length, fanDeg.start, fanDeg.end);
              return (
                <button
                  key={o.key}
                  type="button"
                  role="menuitem"
                  className="lc-fan-item"
                  style={{
                    // posição final do item (offset do centro) + delay escalonado
                    // pra "abrir em leque" (cada item entra um pouco depois).
                    ["--fx" as string]: `${x}px`,
                    ["--fy" as string]: `${y}px`,
                    animationDelay: `${i * 45}ms`,
                  }}
                  onClick={() => pick(o.key)}
                  aria-label={o.label}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ideia: campo curtinho pra não perder a sacada (a lâmpada abre isto). */}
      {ideaOpen && (
        <div className="lc-fan-overlay" onClick={() => setIdeaOpen(false)}>
          <div className="lc-idea-box" onClick={(e) => e.stopPropagation()}>
            <span className="label">Ideia rápida</span>
            <textarea
              autoFocus
              rows={2}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="Anota a sacada (curtinho)…"
            />
            <div className="lc-idea-actions">
              <button type="button" className="ghost" onClick={() => { setIdeaText(""); setIdeaOpen(false); }}>
                Cancelar
              </button>
              <button type="button" className="primary" onClick={saveIdea}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Pré-preenche o debrief: o que foi marcado ao vivo, com o minuto no set.
    Quebra erro E acerto por subtipo (espelhados); ícones SVG, sem emoji. */
function MarkerSummary({ markers }: { markers: Marker[] }) {
  const weak = WEAK_TYPES.map((w) => ({
    label: w.label,
    n: markers.filter((m) => m.kind === "weak" && m.tipo === w.key).length,
  })).filter((x) => x.n > 0);
  const strong = STRONG_TYPES.map((s) => ({
    label: s.label,
    n: markers.filter((m) => m.kind === "moment" && m.tipo === s.key).length,
  })).filter((x) => x.n > 0);
  const moments = markers.filter((m) => m.kind === "moment");
  const ideas = markers.filter((m) => m.kind === "idea");
  return (
    <div className="card marker-summary">
      <span className="label">Você marcou nesta sessão</span>
      {weak.length > 0 && (
        <p className="ms-line">
          <span className="ms-ic ms-ic-err"><IcAlert size={16} /></span>
          Pontos fracos: {weak.map((w) => `${w.label} ×${w.n}`).join(" · ")}
        </p>
      )}
      {moments.length > 0 && (
        <p className="ms-line">
          <span className="ms-ic ms-ic-hit"><IcFlame size={16} /></span>
          Acertos: {moments.length}
          {strong.length > 0 ? ` · ${strong.map((s) => `${s.label} ×${s.n}`).join(" · ")}` : ""}
          {` · ${moments.map((m) => fmtAt(m.atMs)).join(", ")}`}
        </p>
      )}
      {ideas.length > 0 && (
        <p className="ms-line">
          <span className="ms-ic ms-ic-idea"><IcBulb size={16} /></span>
          Ideias: {ideas.length} · {ideas.map((m) => fmtAt(m.atMs)).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Avaliação por estrelas (0.5..5), igual ao PC — metade da estrela = meio ponto. */
function StarRating({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
  return (
    <div className="star-row">
      <span className="label">{label}</span>
      <div className="stars" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const full = value >= n;
          const half = !full && value >= n - 0.5;
          return (
            <span key={n} className={"star-wrap" + (full ? " full" : "")}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill={full ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={STAR_PATH} />
              </svg>
              {half && (
                <span className="star-fill" aria-hidden>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={STAR_PATH} />
                  </svg>
                </span>
              )}
              <button type="button" className="star-half left" onClick={() => onChange(n - 0.5)} aria-label={`${n - 0.5} estrelas`} />
              <button type="button" className="star-half right" onClick={() => onChange(n)} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
type Phase = "idle" | "running" | "done";

export function Foco() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activity, setActivity] = useState(ACTIVITIES[0]);
  const [plannedStr, setPlannedStr] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expired, setExpired] = useState(false);

  const startRef = useRef<number | null>(null);
  const pauseOffsetRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const tickRef = useRef<number | undefined>(undefined);
  const notifRef = useRef<number | undefined>(undefined);
  const expiredNotifiedRef = useRef(false);
  // Refs lidos pelos timers (evita closure velha ao restaurar a sessão).
  const activityRef = useRef(ACTIVITIES[0]);
  const plannedMsRef = useRef<number | null>(null);

  // Modo imersivo: sessão rodando recolhe header + rodapé (o App escuta).
  // Sair da tela (unmount) ou encerrar devolve tudo.
  useEffect(() => {
    const im = phase === "running";
    window.dispatchEvent(new CustomEvent("vistage:immersive", { detail: im }));
    return () => {
      if (im) window.dispatchEvent(new CustomEvent("vistage:immersive", { detail: false }));
    };
  }, [phase]);

  const [doneAt, setDoneAt] = useState<{ startedAt: string; endedAt: string } | null>(null);
  const [energy, setEnergy] = useState(3);
  const [focusLvl, setFocusLvl] = useState(3);
  // Palco: avalia o SET (vai pro debrief da GIG) em vez de energia/foco.
  const [repertoire, setRepertoire] = useState(3);
  const [technique, setTechnique] = useState(3);
  const [charisma, setCharisma] = useState(3);
  const [floor, setFloor] = useState(3); // Pista: lotação/retenção/resposta
  const [isSpecial, setIsSpecial] = useState(false); // ⭐ selo de destaque
  // GIG resolvida quando a atividade é "Tempo de palco" (id + título). Ref pra os
  // marcadores ao vivo carregarem o gig_id sem closure velha.
  const [stageGig, setStageGig] = useState<StageGigOption | null>(null);
  const stageGigRef = useRef<StageGigOption | null>(null);
  const [gigOptions, setGigOptions] = useState<StageGigOption[]>([]);
  const [gigsReady, setGigsReady] = useState(true);
  // Ids vindos de uma sessão restaurada (one-shot): os efeitos de carga preferem
  // eles ao padrão "mais próxima" — senão o restore trocaria a escolha do usuário.
  const restoreGigIdRef = useRef<number | null>(null);
  const restoreCtxIdRef = useRef<number | null>(null);
  // Vínculo opcional (Criação musical→faixa, Produção de festa→festa, Comunicação
  // →reunião). Padrão: sem vínculo. O ref alimenta o save() sem closure velha.
  const [ctxOptions, setCtxOptions] = useState<CtxOption[]>([]);
  const [ctxSel, setCtxSel] = useState<CtxOption | null>(null);
  const ctxSelRef = useRef<CtxOption | null>(null);
  const [ctxReady, setCtxReady] = useState(true);
  // Checklist de Preparação marcado (otimista) da GIG escolhida — semeado pelo
  // meta.prep_done e alterado pelo painel/Check do Modo Foco (manda prep_check).
  const [prepDone, setPrepDone] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Captura ao vivo: marcadores da sessão (estado p/ render + ref p/ persistir
  // de dentro dos callbacks sem closure velha) e o id que liga tudo (markers +
  // debrief) pro desktop juntar depois.
  const [markers, setMarkers] = useState<Marker[]>([]);
  const markersRef = useRef<Marker[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  // Tarefa em foco (vinda do "play" na tarefa, em Hoje/Tarefas): no modo Gestão
  // mostra o checklist dela. Lido do localStorage ao montar.
  const [focusTask, setFocusTask] = useState<{ id: string; title: string } | null>(null);

  const plannedMin = (() => {
    const n = Number(plannedStr);
    return plannedStr.trim() && !isNaN(n) && n > 0 ? Math.round(n) : null;
  })();
  const plannedMs = plannedMin ? plannedMin * 60_000 : null;
  const progress = plannedMs ? elapsedMs / plannedMs : null;

  function computeElapsed(): number {
    if (startRef.current == null) return 0;
    const end = pauseStartRef.current ?? Date.now();
    return Math.max(0, end - startRef.current - pauseOffsetRef.current);
  }

  function notifBody(): string {
    const ms = computeElapsed();
    const pMin = plannedMsRef.current ? Math.round(plannedMsRef.current / 60_000) : null;
    return `${activityRef.current} · ${fmtClock(ms)}${pMin ? ` / ${fmtPlanned(pMin)}` : ""}`;
  }

  function persist() {
    if (startRef.current == null) return;
    saveSession({
      startedAtMs: startRef.current,
      pauseOffsetMs: pauseOffsetRef.current,
      pausedAtMs: pauseStartRef.current,
      activity: activityRef.current,
      plannedStr,
      sessionId: sessionIdRef.current,
      markers: markersRef.current,
      stageGigId: stageGigRef.current?.id ?? null,
      ctxId: ctxSelRef.current?.id ?? null,
    });
  }

  /** Registra um marcador de UM TOQUE (ponto fraco/momento/ideia). A ideia pode
      vir com uma breve nota digitada na hora (os demais descrevem no PC). */
  function addMarker(kind: MarkerKind, tipo?: WeakType | StrongType, note?: string) {
    if (phase !== "running" || !sessionIdRef.current) return;
    const atMs = computeElapsed();
    const next = [...markersRef.current, { id: crypto.randomUUID(), kind, tipo, atMs }];
    markersRef.current = next;
    setMarkers(next);
    persist();
    void haptic(kind === "moment" ? "heavy" : "light");
    // Vira captura durável (fila offline) já com o id da sessão + timestamp; a
    // descrição é preenchida depois no PC (exceto a nota rápida da ideia).
    const captureKind = kind === "weak" ? "weak_point" : kind === "moment" ? "moment" : "focus_idea";
    void enqueueCapture(captureKind, {
      focus_session_id: sessionIdRef.current,
      at: new Date().toISOString(),
      at_ms: atMs,
      // Sessão de palco → liga o marcador à GIG (vira ponto fraco/forte no debrief).
      gig_id: stageGigRef.current?.id ?? null,
      ...(tipo ? { tipo } : {}),
      ...(note ? { note } : {}),
    });
  }

  // Liga os timers (contador + notificação persistente). Lê os refs, então
  // funciona tanto no start quanto ao restaurar uma sessão já em andamento.
  function runTimers() {
    stopTimers();
    tickRef.current = window.setInterval(() => {
      const ms = computeElapsed();
      setElapsedMs(ms);
      const pMs = plannedMsRef.current;
      if (pMs && ms >= pMs && !expiredNotifiedRef.current) {
        expiredNotifiedRef.current = true;
        setExpired(true);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        void showFocusNotification(`Tempo previsto atingido: continue ou encerre. (${activityRef.current})`, {
          title: "Tempo previsto atingido",
          renotify: true,
        });
      }
    }, 1000);
    void showFocusNotification(notifBody());
    notifRef.current = window.setInterval(() => {
      void showFocusNotification(notifBody());
    }, 30 * 60 * 1000);
  }

  function start() {
    startRef.current = Date.now();
    pauseOffsetRef.current = 0;
    pauseStartRef.current = null;
    expiredNotifiedRef.current = false;
    activityRef.current = activity;
    plannedMsRef.current = plannedMs;
    sessionIdRef.current = crypto.randomUUID();
    markersRef.current = [];
    setMarkers([]);
    setElapsedMs(0);
    setExpired(false);
    setPaused(false);
    setMsg(null);
    setPhase("running");
    persist();
    runTimers();
  }

  function togglePause() {
    if (paused) {
      // retoma
      if (pauseStartRef.current != null) {
        pauseOffsetRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      setPaused(false);
    } else {
      pauseStartRef.current = Date.now();
      setElapsedMs(computeElapsed()); // congela o número no instante da pausa
      setPaused(true);
    }
    persist();
  }

  function stopTimers() {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (notifRef.current) window.clearInterval(notifRef.current);
  }

  function encerrar() {
    stopTimers();
    clearSession();
    void clearFocusNotification();
    const end = Date.now();
    setDoneAt({
      startedAt: new Date(startRef.current ?? end).toISOString(),
      endedAt: new Date(end).toISOString(),
    });
    setPhase("done");
  }

  // Restaura uma sessão em andamento ao montar (trocar de aba/fechar e voltar).
  useEffect(() => {
    const s = loadSession();
    if (s && typeof s.startedAtMs === "number") {
      startRef.current = s.startedAtMs;
      pauseOffsetRef.current = s.pauseOffsetMs ?? 0;
      pauseStartRef.current = s.pausedAtMs ?? null;
      activityRef.current = s.activity || ACTIVITIES[0];
      const n = Number(s.plannedStr);
      plannedMsRef.current = s.plannedStr.trim() && !isNaN(n) && n > 0 ? Math.round(n) * 60_000 : null;
      setActivity(s.activity || ACTIVITIES[0]);
      setPlannedStr(s.plannedStr ?? "");
      setPaused(s.pausedAtMs != null);
      sessionIdRef.current = s.sessionId ?? crypto.randomUUID();
      markersRef.current = Array.isArray(s.markers) ? s.markers : [];
      setMarkers(markersRef.current);
      // GIG/vínculo escolhidos antes do restart: os efeitos de carga preferem
      // esses ids ao padrão (one-shot) — o debrief continua indo pra GIG certa.
      restoreGigIdRef.current = typeof s.stageGigId === "number" ? s.stageGigId : null;
      restoreCtxIdRef.current = typeof s.ctxId === "number" ? s.ctxId : null;
      const ms = computeElapsed();
      setElapsedMs(ms);
      if (plannedMsRef.current && ms >= plannedMsRef.current) {
        expiredNotifiedRef.current = true;
        setExpired(true);
      }
      setPhase("running");
      runTimers();
    } else {
      // Sem sessão ativa: aplica a atividade sugerida pela tela Hoje (se houver) +
      // a tarefa em foco (play numa tarefa → Gestão mostrando o checklist dela).
      try {
        const suggested = localStorage.getItem("vistage.foco.suggestedActivity");
        if (suggested && ACTIVITIES.includes(suggested)) setActivity(suggested);
        localStorage.removeItem("vistage.foco.suggestedActivity");
        const taskRaw = localStorage.getItem("vistage.foco.task");
        if (taskRaw) {
          try { setFocusTask(JSON.parse(taskRaw) as { id: string; title: string }); } catch { /* ignora */ }
          localStorage.removeItem("vistage.foco.task");
        }
      } catch {
        /* ok */
      }
    }
    return () => stopTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega as GIGs futuras elegíveis quando a atividade é "Tempo de palco" ou
  // "Preparação" (palco: confirmadas; preparação: também propostas) e seleciona a
  // mais próxima por padrão — o usuário troca pelo picker. A escolhida puxa o
  // contexto/checklist, recebe os marcadores e vira o destino do debrief.
  useEffect(() => {
    if (activity !== "Tempo de palco" && activity !== "Preparação") {
      setStageGig(null);
      stageGigRef.current = null;
      setGigOptions([]);
      setGigsReady(true);
      return;
    }
    let active = true;
    setGigsReady(false);
    void supabase
      .from("catalog_mirror")
      .select("source_id, title, meta")
      .eq("kind", "gig")
      .then(({ data }) => {
        if (!active) return;
        const opts = eligibleStageGigs((data ?? []) as { source_id: string; title: string; meta: GigMeta }[], activity);
        setGigOptions(opts);
        const restored = restoreGigIdRef.current != null ? opts.find((o) => o.id === restoreGigIdRef.current) ?? null : null;
        restoreGigIdRef.current = null;
        const def = restored ?? opts[0] ?? null;
        setStageGig(def);
        stageGigRef.current = def;
        setGigsReady(true);
      });
    return () => {
      active = false;
    };
  }, [activity]);

  // Carrega as opções de vínculo (faixa/festa/reunião) quando a atividade permite.
  // Padrão: sem vínculo (o usuário escolhe). Faixa: em produção; festa: em aberto;
  // reunião: recentes + futuras. Não força — "OU NÃO relacionar".
  useEffect(() => {
    const kind = CTX_KIND[activity];
    setCtxSel(null);
    ctxSelRef.current = null;
    if (!kind) {
      setCtxOptions([]);
      setCtxReady(true);
      return;
    }
    let active = true;
    setCtxReady(false);
    void supabase
      .from("catalog_mirror")
      .select("source_id, title, meta")
      .eq("kind", kind)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as { source_id: string; title: string; meta: Record<string, unknown> }[];
        const g = (m: Record<string, unknown>, k: string): string => (typeof m[k] === "string" ? (m[k] as string) : "");
        const filtered = rows.filter((r) => {
          if (kind === "track") return g(r.meta, "stage") !== "Pós-lançamento";
          if (kind === "party") return !["Realizada", "Cancelada"].includes(g(r.meta, "status"));
          return true; // reuniões: todas
        });
        if (kind === "meeting" || kind === "party") {
          filtered.sort((a, b) => {
            const da = g(a.meta, "date"), db2 = g(b.meta, "date");
            return da < db2 ? 1 : da > db2 ? -1 : 0; // mais recentes primeiro
          });
        }
        const opts = filtered.slice(0, 40).map((r) => ({ id: Number(r.source_id), title: r.title, sub: ctxSub(kind, r.meta) }));
        setCtxOptions(opts);
        // Sessão restaurada: devolve o vínculo que o usuário tinha escolhido.
        const restored = restoreCtxIdRef.current != null ? opts.find((o) => o.id === restoreCtxIdRef.current) ?? null : null;
        restoreCtxIdRef.current = null;
        if (restored) {
          setCtxSel(restored);
          ctxSelRef.current = restored;
        }
        setCtxReady(true);
      });
    return () => {
      active = false;
    };
  }, [activity]);

  // Troca manual da GIG no picker — atualiza estado e ref (debrief/marcadores) e
  // persiste: se o app cair agora, o restore mantém ESTA GIG, não o padrão.
  function selectStageGig(o: StageGigOption) {
    setStageGig(o);
    stageGigRef.current = o;
    persist();
  }

  // Semeia o checklist de Preparação com o que já está marcado na GIG (meta).
  useEffect(() => {
    setPrepDone(new Set(stageGig?.meta.prep_done ?? []));
  }, [stageGig?.id]);

  // Alterna um item do checklist de Preparação (otimista) e manda a captura.
  function tickPrep(itemId: string, label: string) {
    const sg = stageGigRef.current;
    if (!sg) return;
    const willDone = !prepDone.has(itemId);
    setPrepDone((d) => {
      const next = new Set(d);
      if (willDone) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    void enqueueCapture("prep_check", { gig_id: sg.id, item_id: itemId, item_label: label, done: willDone ? 1 : 0 });
    void haptic("light");
  }

  async function save() {
    if (!doneAt) return;
    setBusy(true);
    setMsg(null);
    try {
      const isStage = activity === "Tempo de palco";
      const isPrep = activity === "Preparação";
      const sg = stageGigRef.current;
      // focus_session_id liga o debrief aos marcadores ao vivo (o desktop junta).
      // Palco: manda as avaliações do set + o gig_id → o desktop grava no debrief
      // da GIG (repertório/técnica/carisma) em vez de energia/foco. Preparação:
      // só vincula a sessão à GIG (sem avaliações).
      await enqueueCapture("session", {
        started_at: doneAt.startedAt,
        ended_at: doneAt.endedAt,
        activity_type: activity,
        planned_minutes: plannedMin,
        energy_level: isStage ? null : energy,
        focus_level: isStage ? null : focusLvl,
        notes: notes || null,
        focus_session_id: sessionIdRef.current,
        // Palco manda SEMPRE as avaliações (mesmo sem GIG resolvida) pra não perder
        // o debrief — sem GIG, o PC pergunta na revisão se quer criar uma Concluída.
        ...(isStage
          ? {
              rating_repertoire: repertoire,
              rating_technique: technique,
              rating_charisma: charisma,
              rating_floor: floor,
              is_special: isSpecial ? 1 : 0,
            }
          : {}),
        ...((isStage || isPrep) && sg ? { context_type: "gig", gig_id: sg.id } : {}),
        // Vínculo opcional (Criação musical→faixa, Produção de festa→festa,
        // Comunicação→reunião). Comunicação sem reunião: o PC transforma as notas
        // em ideia; com reunião, vira encaminhamento na ata.
        ...(CTX_KIND[activity] && ctxSelRef.current ? { context_type: CTX_KIND[activity], context_id: ctxSelRef.current.id } : {}),
      });
      setMsg(isStage ? "Set salvo! O debrief sobe pro PC." : "Sessão salva! Sobe pro PC sozinha.");
      setPhase("idle");
      setElapsedMs(0);
      setPlannedStr("");
      setNotes("");
      setDoneAt(null);
      setMarkers([]);
      markersRef.current = [];
      sessionIdRef.current = null;
      setCtxSel(null);
      ctxSelRef.current = null;
      setRepertoire(3);
      setTechnique(3);
      setCharisma(3);
      setFloor(3);
      setIsSpecial(false);
    } catch (e) {
      setMsg("Erro ao salvar: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  const subLabel =
    phase === "running"
      ? paused
        ? "pausado"
        : plannedMin
          ? `/ ${fmtPlanned(plannedMin)}`
          : "em foco"
      : plannedMin
        ? `previsto ${fmtPlanned(plannedMin)}`
        : "pronto pra focar";

  return (
    <div className="screen foco">
      {phase !== "done" && (
        <>
          <FocusRing
            size={216}
            progress={phase === "running" ? progress : plannedMs ? 0 : null}
            timeLabel={fmtClock(elapsedMs)}
            subLabel={subLabel}
            expired={expired}
            paused={paused}
            running={phase === "running"}
            onToggle={phase === "running" ? togglePause : start}
          />

          {expired && phase === "running" && (
            <p className="focus-expired">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2" /></svg>
              tempo previsto atingido
            </p>
          )}

          {/* Captura ao vivo: LOGO ABAIXO do relógio e EM CIMA de Encerrar,
              num arco que segue a linha do círculo. */}
          {phase === "running" && (activity === "Preparação"
            ? <PrepLiveCapture gig={stageGig} done={prepDone} onTick={tickPrep} />
            : <LiveCapture markers={markers} onMark={addMarker} />)}

          {phase === "idle" ? (
            <>
              <button className="focus-ctl start" onClick={start} aria-label="Iniciar foco" title="Iniciar foco">
                <IcPlay size={30} />
              </button>
              <div className="form" style={{ width: "100%", maxWidth: 360 }}>
              <label>
                Tipo de foco
                <select value={activity} onChange={(e) => setActivity(e.target.value)}>
                  {MODE_LAYOUT.map((a, i) =>
                    a === SEP ? (
                      <option key={"sep" + i} disabled>──────────</option>
                    ) : (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label>
                Tempo previsto (opcional)
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="ex: 45 (minutos)"
                  value={plannedStr}
                  onChange={(e) => setPlannedStr(e.target.value)}
                />
              </label>
              </div>
            </>
          ) : (
            /* Pausar/retomar + Encerrar lado a lado, centralizados sob o anel. */
            <div className="focus-controls">
              <button
                className="focus-ctl"
                onClick={togglePause}
                aria-label={paused ? "Retomar" : "Pausar"}
                title={paused ? "Retomar" : "Pausar"}
              >
                {paused ? <IcPlay size={26} /> : <IcPause size={26} />}
              </button>
              <button className="focus-stop" onClick={encerrar} aria-label="Encerrar" title="Encerrar">
                <IcStop />
              </button>
            </div>
          )}

          {(activity === "Tempo de palco" || activity === "Preparação") && (
            <StageGigPicker
              options={gigOptions}
              selectedId={stageGig?.id ?? null}
              onSelect={selectStageGig}
              activity={activity}
              loading={!gigsReady}
            />
          )}
          {CTX_KIND[activity] && (
            <ContextPicker
              label={activity === "Criação musical" ? "Vincular à faixa" : activity === "Produção de festa" ? "Vincular à festa" : "Vincular à reunião"}
              noneLabel={activity === "Comunicação" ? "Sem reunião (vira ideia)" : "Sem vínculo"}
              options={ctxOptions}
              selectedId={ctxSel?.id ?? null}
              onSelect={(o) => { setCtxSel(o); ctxSelRef.current = o; persist(); }}
              loading={!ctxReady}
            />
          )}
          <ContextPanel activity={activity} focusTask={focusTask} stageGig={stageGig} stageLoading={!gigsReady} prepDone={prepDone} onTickPrep={tickPrep} />
        </>
      )}

      {phase === "done" && (
        <>
          {markers.length > 0 && <MarkerSummary markers={markers} />}
          <section className="card form" style={{ width: "100%" }}>
          <p className="muted">Sessão de {fmtClock(elapsedMs)} · {activity}</p>
          {activity === "Tempo de palco" ? (
            <>
              {stageGig && (
                <p className="muted" style={{ fontSize: "0.8rem" }}>Debrief de palco: {stageGig.title}</p>
              )}
              <StarRating label="Repertório" value={repertoire} onChange={setRepertoire} />
              <StarRating label="Técnica" value={technique} onChange={setTechnique} />
              <StarRating label="Carisma" value={charisma} onChange={setCharisma} />
              <StarRating label="Pista" value={floor} onChange={setFloor} />
              <button
                type="button"
                onClick={() => setIsSpecial((v) => !v)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: "0.35rem 0.7rem",
                  borderRadius: 999,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  border: isSpecial ? "1px solid #f5c83c" : "1px solid var(--border)",
                  background: isSpecial ? "color-mix(in srgb, #f5c83c 18%, transparent)" : "var(--surface-2)",
                  color: isSpecial ? "#c99a1e" : "var(--muted)",
                }}
              >
                {isSpecial ? "⭐ GIG especial" : "Marcar como especial"}
              </button>
            </>
          ) : (
            <>
              <StarRating label="Energia" value={energy} onChange={setEnergy} />
              <StarRating label="Foco" value={focusLvl} onChange={setFocusLvl} />
            </>
          )}
          <label>
            {activity === "Comunicação" ? "Encaminhamentos / notas" : "Notas"}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" />
          </label>
          {activity === "Comunicação" && (
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: "-0.2rem" }}>
              {ctxSel ? `Vão como encaminhamentos na ata de "${ctxSel.title}".` : "Sem reunião: as notas viram uma ideia no PC."}
            </p>
          )}
          <button className="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Enviando…" : activity === "Tempo de palco" ? "Salvar set" : "Salvar sessão"}
          </button>
          </section>
        </>
      )}

      {msg && <p className="muted center-text">{msg}</p>}
    </div>
  );
}
