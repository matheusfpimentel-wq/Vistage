import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { buildFocusBody, clearFocusNotification, showFocusNotification } from "../push";

const ACTIVITIES = ["Criação musical", "Aulas", "Conteúdo", "Admin", "Estudo", "Outro"];

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Palco: a próxima GIG (ou a de hoje) com as infos do dia ──────────────────
type GigMeta = {
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
  city?: string | null;
  status?: string | null;
  promoter_name?: string | null;
  day_contact_name?: string | null;
  day_contact_phone?: string | null;
};
type StageGig = { title: string } & GigMeta;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** "tempo de palco": só no dia da GIG — contagem até o set / no palco agora. */
function stageTiming(g: StageGig): { label: string; live: boolean } | null {
  if (!g.date || g.date !== todayISO()) return null;
  if (!g.start_time) return { label: "Hoje", live: false };
  const now = Date.now();
  const start = new Date(`${g.date}T${g.start_time}:00`).getTime();
  const end = g.end_time ? new Date(`${g.date}T${g.end_time}:00`).getTime() : null;
  if (now < start) {
    const mins = Math.round((start - now) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return { label: `Sobe ao palco em ${h > 0 ? `${h}h ` : ""}${m}min`, live: false };
  }
  if (end != null && now <= end) return { label: "No palco agora", live: true };
  if (end == null) return { label: "No palco", live: true };
  return { label: "Set encerrado", live: false };
}

function fmtDate(d?: string): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function StageCard() {
  const [gig, setGig] = useState<StageGig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, force] = useState(0);

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
    const id = window.setInterval(() => force((n) => n + 1), 30_000); // atualiza a contagem
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  if (!loaded || !gig) return null;
  const isToday = gig.date === todayISO();
  const timing = stageTiming(gig);
  const wa = gig.day_contact_phone ? `https://wa.me/${gig.day_contact_phone.replace(/\D/g, "")}` : null;

  return (
    <section className={"card stage" + (timing?.live ? " stage-live" : "")}>
      <div className="stage-head">
        <span className="label">{isToday ? "Hoje no palco" : "Próximo palco"}</span>
        {timing && <span className={"stage-timing" + (timing.live ? " live" : "")}>{timing.label}</span>}
      </div>
      <strong className="stage-title">{gig.title}</strong>
      <div className="muted stage-sub">{[fmtDate(gig.date), gig.city].filter(Boolean).join(" · ")}</div>
      <dl className="detail-rows stage-rows">
        {gig.start_time && (
          <div>
            <dt>Set</dt>
            <dd>
              {gig.start_time}
              {gig.end_time ? `–${gig.end_time}` : ""}
            </dd>
          </div>
        )}
        {gig.promoter_name && (
          <div>
            <dt>Contratante</dt>
            <dd>{gig.promoter_name}</dd>
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
        {gig.status && (
          <div>
            <dt>Status</dt>
            <dd>{gig.status}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function Foco() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [done, setDone] = useState<{ startedAt: string; endedAt: string } | null>(null);
  const [activity, setActivity] = useState(ACTIVITIES[0]);
  const [energy, setEnergy] = useState(3);
  const [focusLvl, setFocusLvl] = useState(3);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function start() {
    startRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
    setDone(null);
    setMsg(null);
    timerRef.current = window.setInterval(() => {
      setElapsed(Date.now() - (startRef.current ?? Date.now()));
    }, 1000);
    // Modo foco: notificação persistente com as pendências.
    void buildFocusBody().then(showFocusNotification);
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    void clearFocusNotification();
    setRunning(false);
    const end = Date.now();
    setDone({
      startedAt: new Date(startRef.current ?? end).toISOString(),
      endedAt: new Date(end).toISOString(),
    });
  }

  async function save() {
    if (!done) return;
    setBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("capture_inbox").insert({
      user_id: u.user?.id,
      kind: "session",
      client_ref: crypto.randomUUID(),
      payload: {
        started_at: done.startedAt,
        ended_at: done.endedAt,
        activity_type: activity,
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
      setDone(null);
      setElapsed(0);
      setNotes("");
    }
  }

  return (
    <div className="screen foco">
      <StageCard />

      <div className="timer">{mmss(elapsed)}</div>

      {!running && !done && (
        <button className="primary big-btn" onClick={start}>
          Iniciar foco
        </button>
      )}
      {running && (
        <button className="danger big-btn" onClick={stop}>
          Parar
        </button>
      )}

      {done && (
        <section className="card form">
          <label>
            Atividade
            <select value={activity} onChange={(e) => setActivity(e.target.value)}>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
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
