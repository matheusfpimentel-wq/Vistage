import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { clearFocusNotification, showFocusNotification } from "../push";
import { haptic } from "../native";
import { enqueueCapture } from "../queue";

// Tipos alinhados ao desktop (ActivityType) pra estatística e painel baterem.
const ACTIVITIES = [
  "Tempo de palco",
  "Criação musical",
  "Criação de conteúdo",
  "Gestão",
  "Aulas",
  "Estudo",
  "Outro",
];

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  const showPause = running && !paused;
  const ic = Math.round(size * 0.16);

  return (
    <button
      type="button"
      className="focus-ring"
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
        <span className="focus-ring-ic" style={{ color: ringColor }}>
          {showPause ? (
            <svg width={ic} height={ic} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width={ic} height={ic} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </span>
        <span className={"focus-ring-time" + (expired ? " expired" : "")} style={{ fontSize: size * 0.16 }}>
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

type Persisted = {
  startedAtMs: number;
  pauseOffsetMs: number;
  pausedAtMs: number | null;
  activity: string;
  plannedStr: string;
  sessionId: string | null;
  markers: Marker[];
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
};
type StageGig = { title: string } & GigMeta;

function pickStageGig(rows: { title: string; meta: GigMeta }[]): StageGig | null {
  const today = todayISO();
  const upcoming = rows
    .map((r) => ({ title: r.title, ...(r.meta ?? {}) }))
    .filter((g) => typeof g.date === "string" && g.date >= today && g.status !== "Cancelada")
    .sort((a, b) =>
      a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : (a.start_time ?? "").localeCompare(b.start_time ?? "")
    );
  return upcoming[0] ?? null;
}

/** Mesma escolha do painel, mas carregando o id (source_id) — pra o debrief de
    palco cair na GIG certa e os marcadores irem pra ela. */
function pickStageGigId(rows: { source_id: string; title: string; meta: GigMeta }[]): { id: number; title: string } | null {
  const today = todayISO();
  const upcoming = rows
    .map((r) => ({ id: Number(r.source_id), title: r.title, ...(r.meta ?? {}) }))
    .filter((g) => Number.isFinite(g.id) && typeof g.date === "string" && g.date >= today && g.status !== "Cancelada")
    .sort((a, b) =>
      a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : (a.start_time ?? "").localeCompare(b.start_time ?? "")
    );
  const g = upcoming[0];
  return g ? { id: g.id, title: g.title } : null;
}

function fmtDate(d?: string): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function StagePanel() {
  const [gig, setGig] = useState<StageGig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase
      .from("catalog_mirror")
      .select("title, meta")
      .eq("kind", "gig")
      .then(({ data }) => {
        if (!active) return;
        setGig(pickStageGig((data ?? []) as { title: string; meta: GigMeta }[]));
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) return null;
  if (!gig) return <p className="muted center-text">Sem GIG próxima pra puxar contexto de palco.</p>;

  const periods = gig.set_periods && gig.set_periods.length > 0
    ? gig.set_periods
    : gig.start_time
      ? [{ start: gig.start_time, end: gig.end_time ?? "" }]
      : [];
  const wa = gig.day_contact_phone ? `https://wa.me/${gig.day_contact_phone.replace(/\D/g, "")}` : null;

  return (
    <section className="card stage">
      <span className="label">{gig.date === todayISO() ? "Hoje no palco" : "Próximo palco"}</span>
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

function ContextPanel({ activity, focusTask }: { activity: string; focusTask: { id: string; title: string } | null }) {
  if (activity === "Tempo de palco") return <StagePanel />;
  if (activity === "Criação musical") return <MusicPanel />;
  if (activity === "Gestão") return <GestaoPanel focusTask={focusTask} />;
  return null;
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
 * então o arco abre pra CIMA (em direção ao relógio, onde há espaço) — ângulos de
 * ~215° a ~325° (medidos no sentido horário a partir das 3h, com Y pra baixo).
 * Assim os itens sobem em leque acima do botão tocado. A âncora (fanOrigin) é
 * presa nas bordas pra os itens não cortarem fora da viewport.
 */
const FAN_RADIUS = 112; // distância do centro do botão até cada item do leque
const FAN_START = 215;   // grau do primeiro item (aponta pra cima-esquerda)
const FAN_END = 325;     // grau do último item (aponta pra cima-direita)

/** Posição (x,y) de um item do leque, relativa ao centro do botão. */
function fanOffset(i: number, total: number): { x: number; y: number } {
  const t = total <= 1 ? 0 : i / (total - 1);
  const deg = FAN_START + (FAN_END - FAN_START) * t;
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * FAN_RADIUS, y: Math.sin(rad) * FAN_RADIUS };
}

/** Centro do botão tocado, preso às bordas pra o leque (raio ~112) não cortar
    fora da tela — os botões agora ficam centralizados embaixo do relógio. */
function fanAnchor(r: DOMRect): { x: number; y: number } {
  const margin = FAN_RADIUS + 16;
  const x = Math.min(Math.max(r.left + r.width / 2, margin), window.innerWidth - margin);
  return { x, y: r.top + r.height / 2 };
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

  return (
    <section className="live-capture">
      <span className="label">Ao vivo</span>
      <div className="lc-round-row">
        <button
          type="button"
          className="glass-round lc-round lc-round-err"
          onClick={(e) => {
            setFanOrigin(fanAnchor(e.currentTarget.getBoundingClientRect()));
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
            setFanOrigin(fanAnchor(e.currentTarget.getBoundingClientRect()));
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
      <p className="muted lc-hint">Erro/acerto: detalhe no PC. Ideia: anota aqui.</p>

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
              const { x, y } = fanOffset(i, options.length);
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
      <p className="muted ms-hint">Já capturados — descreva cada um no PC, na revisão do GIG.</p>
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

  const [doneAt, setDoneAt] = useState<{ startedAt: string; endedAt: string } | null>(null);
  const [energy, setEnergy] = useState(3);
  const [focusLvl, setFocusLvl] = useState(3);
  // Palco: avalia o SET (vai pro debrief da GIG) em vez de energia/foco.
  const [repertoire, setRepertoire] = useState(3);
  const [technique, setTechnique] = useState(3);
  const [charisma, setCharisma] = useState(3);
  // GIG resolvida quando a atividade é "Tempo de palco" (id + título). Ref pra os
  // marcadores ao vivo carregarem o gig_id sem closure velha.
  const [stageGig, setStageGig] = useState<{ id: number; title: string } | null>(null);
  const stageGigRef = useRef<{ id: number; title: string } | null>(null);
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
        void showFocusNotification(`Tempo previsto atingido — continue ou encerre. (${activityRef.current})`, {
          title: "Tempo previsto atingido",
          renotify: true,
        });
      }
    }, 1000);
    void showFocusNotification(notifBody());
    notifRef.current = window.setInterval(() => {
      void showFocusNotification(notifBody());
    }, 30_000);
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

  // Resolve a GIG do palco (próxima/de hoje) quando a atividade é "Tempo de palco",
  // pra os marcadores ao vivo e o debrief caírem nela. Limpa pras outras atividades.
  useEffect(() => {
    if (activity !== "Tempo de palco") {
      setStageGig(null);
      stageGigRef.current = null;
      return;
    }
    let active = true;
    void supabase
      .from("catalog_mirror")
      .select("source_id, title, meta")
      .eq("kind", "gig")
      .then(({ data }) => {
        if (!active) return;
        const picked = pickStageGigId((data ?? []) as { source_id: string; title: string; meta: GigMeta }[]);
        setStageGig(picked);
        stageGigRef.current = picked;
      });
    return () => {
      active = false;
    };
  }, [activity]);

  async function save() {
    if (!doneAt) return;
    setBusy(true);
    setMsg(null);
    try {
      const isStage = activity === "Tempo de palco";
      const sg = stageGigRef.current;
      // focus_session_id liga o debrief aos marcadores ao vivo (o desktop junta).
      // Palco: manda as avaliações do set + o gig_id → o desktop grava no debrief
      // da GIG (repertório/técnica/carisma) em vez de energia/foco.
      await enqueueCapture("session", {
        started_at: doneAt.startedAt,
        ended_at: doneAt.endedAt,
        activity_type: activity,
        planned_minutes: plannedMin,
        energy_level: isStage ? null : energy,
        focus_level: isStage ? null : focusLvl,
        notes: notes || null,
        focus_session_id: sessionIdRef.current,
        ...(isStage && sg
          ? {
              context_type: "gig",
              gig_id: sg.id,
              rating_repertoire: repertoire,
              rating_technique: technique,
              rating_charisma: charisma,
            }
          : {}),
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
      setRepertoire(3);
      setTechnique(3);
      setCharisma(3);
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
          {phase === "running" && <LiveCapture markers={markers} onMark={addMarker} />}

          {phase === "idle" ? (
            <div className="form" style={{ width: "100%", maxWidth: 360 }}>
              <label>
                Tipo de foco
                <select value={activity} onChange={(e) => setActivity(e.target.value)}>
                  {ACTIVITIES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
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
          ) : (
            <button className="focus-encerrar" onClick={encerrar}>
              Encerrar
            </button>
          )}

          <ContextPanel activity={activity} focusTask={focusTask} />
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
              <label>
                Repertório: {repertoire}
                <input type="range" min={1} max={5} value={repertoire} onChange={(e) => setRepertoire(Number(e.target.value))} />
              </label>
              <label>
                Técnica: {technique}
                <input type="range" min={1} max={5} value={technique} onChange={(e) => setTechnique(Number(e.target.value))} />
              </label>
              <label>
                Carisma: {charisma}
                <input type="range" min={1} max={5} value={charisma} onChange={(e) => setCharisma(Number(e.target.value))} />
              </label>
            </>
          ) : (
            <>
              <label>
                Energia: {energy}
                <input type="range" min={1} max={5} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} />
              </label>
              <label>
                Foco: {focusLvl}
                <input type="range" min={1} max={5} value={focusLvl} onChange={(e) => setFocusLvl(Number(e.target.value))} />
              </label>
            </>
          )}
          <label>
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" />
          </label>
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
