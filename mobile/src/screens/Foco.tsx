import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { clearFocusNotification, showFocusNotification } from "../push";

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

// ── Círculo do foco (anel de progresso + play/pause) ─────────────────────────
function FocusRing({
  size,
  progress,
  timeLabel,
  subLabel,
  phase,
  expired,
  onTap,
}: {
  size: number;
  progress: number | null;
  timeLabel: string;
  subLabel: string;
  phase: "idle" | "running";
  expired: boolean;
  onTap: () => void;
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
      className="focus-ring"
      style={{ width: size, height: size }}
      onClick={onTap}
      aria-label={phase === "idle" ? "Iniciar foco" : "Pausar/retomar"}
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
        {phase === "idle" ? (
          <svg width={size * 0.28} height={size * 0.28} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <>
            <span className={"focus-ring-time" + (expired ? " expired" : "")} style={{ fontSize: size * 0.19 }}>
              {timeLabel}
            </span>
            <span className="focus-ring-sub">{subLabel}</span>
          </>
        )}
      </span>
    </button>
  );
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

function ContextPanel({ activity }: { activity: string }) {
  if (activity === "Tempo de palco") return <StagePanel />;
  if (activity === "Criação musical") return <MusicPanel />;
  return null;
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

  const [doneAt, setDoneAt] = useState<{ startedAt: string; endedAt: string } | null>(null);
  const [energy, setEnergy] = useState(3);
  const [focusLvl, setFocusLvl] = useState(3);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const plannedMin = (() => {
    const n = Number(plannedStr);
    return plannedStr.trim() && !isNaN(n) && n > 0 ? Math.round(n) : null;
  })();
  const plannedMs = plannedMin ? plannedMin * 60_000 : null;
  const progress = plannedMs ? elapsedMs / plannedMs : null;

  const notifBody = useCallback(
    (ms: number) => `${activity} · ${fmtClock(ms)}${plannedMin ? ` / ${fmtPlanned(plannedMin)}` : ""}`,
    [activity, plannedMin]
  );

  function computeElapsed(): number {
    if (startRef.current == null) return 0;
    const end = pauseStartRef.current ?? Date.now();
    return Math.max(0, end - startRef.current - pauseOffsetRef.current);
  }

  function start() {
    startRef.current = Date.now();
    pauseOffsetRef.current = 0;
    pauseStartRef.current = null;
    expiredNotifiedRef.current = false;
    setElapsedMs(0);
    setExpired(false);
    setPaused(false);
    setMsg(null);
    setPhase("running");

    tickRef.current = window.setInterval(() => {
      const ms = computeElapsed();
      setElapsedMs(ms);
      if (plannedMs && ms >= plannedMs && !expiredNotifiedRef.current) {
        expiredNotifiedRef.current = true;
        setExpired(true);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        void showFocusNotification(`Tempo previsto atingido — continue ou encerre. (${activity})`, {
          title: "⏰ Tempo previsto atingido",
          renotify: true,
        });
      }
    }, 1000);

    // Notificação persistente com o tempo (atualiza a cada 30s, tag "foco").
    void showFocusNotification(notifBody(0));
    notifRef.current = window.setInterval(() => {
      void showFocusNotification(notifBody(computeElapsed()));
    }, 30_000);
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
      setPaused(true);
    }
  }

  function stopTimers() {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (notifRef.current) window.clearInterval(notifRef.current);
  }

  function encerrar() {
    stopTimers();
    void clearFocusNotification();
    const end = Date.now();
    setDoneAt({
      startedAt: new Date(startRef.current ?? end).toISOString(),
      endedAt: new Date(end).toISOString(),
    });
    setPhase("done");
  }

  useEffect(() => () => stopTimers(), []);

  async function save() {
    if (!doneAt) return;
    setBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("capture_inbox").insert({
      user_id: u.user?.id,
      kind: "session",
      client_ref: crypto.randomUUID(),
      payload: {
        started_at: doneAt.startedAt,
        ended_at: doneAt.endedAt,
        activity_type: activity,
        planned_minutes: plannedMin,
        energy_level: energy,
        focus_level: focusLvl,
        notes: notes || null,
      },
    });
    setBusy(false);
    if (error) {
      setMsg("Erro: " + error.message);
    } else {
      setMsg("Sessão enviada! Aparece no PC na próxima sincronização.");
      setPhase("idle");
      setElapsedMs(0);
      setPlannedStr("");
      setNotes("");
      setDoneAt(null);
    }
  }

  const subLabel = paused ? "▶ pausado" : plannedMin ? `⏸ / ${fmtPlanned(plannedMin)}` : "⏸ foco";

  return (
    <div className="screen foco">
      {phase !== "done" && (
        <>
          <FocusRing
            size={216}
            progress={phase === "running" ? progress : plannedMs ? 0 : null}
            timeLabel={fmtClock(elapsedMs)}
            subLabel={subLabel}
            phase={phase === "running" ? "running" : "idle"}
            expired={expired}
            onTap={phase === "running" ? togglePause : start}
          />

          {expired && phase === "running" && (
            <p className="focus-expired">⏰ tempo previsto atingido</p>
          )}

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
            <button className="danger big-btn" onClick={encerrar}>
              Encerrar
            </button>
          )}

          <ContextPanel activity={activity} />
        </>
      )}

      {phase === "done" && (
        <section className="card form" style={{ width: "100%" }}>
          <p className="muted">Sessão de {fmtClock(elapsedMs)} · {activity}</p>
          <label>
            Energia: {energy}
            <input type="range" min={1} max={5} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} />
          </label>
          <label>
            Foco: {focusLvl}
            <input type="range" min={1} max={5} value={focusLvl} onChange={(e) => setFocusLvl(Number(e.target.value))} />
          </label>
          <label>
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opcional" />
          </label>
          <button className="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Enviando…" : "Salvar sessão"}
          </button>
        </section>
      )}

      {msg && <p className="muted center-text">{msg}</p>}
    </div>
  );
}
