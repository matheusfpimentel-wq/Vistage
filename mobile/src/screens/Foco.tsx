import { useRef, useState } from "react";
import { supabase } from "../supabase";

const ACTIVITIES = ["Criação musical", "Aulas", "Conteúdo", "Admin", "Estudo", "Outro"];

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
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
