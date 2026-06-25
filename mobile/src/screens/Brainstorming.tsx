import { useMemo, useState } from "react";
import { sendCapture } from "../capture";

// Provocações "perenes" (mesmo espírito do dado de insights do desktop).
const PROVOCATIONS = [
  "Se você só pudesse tocar em 1 lugar neste mês, qual seria — e por quê?",
  "Qual som/transição te marcou na última GIG?",
  "Que faixa sua merecia um vídeo? Como seria a cena de abertura?",
  "Quem você quer que te chame pra tocar daqui a 1 ano? O que falta?",
  "Qual hábito de produção te trava mais hoje?",
  "Se dobrasse seu cachê, o que mudaria no seu set?",
  "Que colaboração improvável valeria um teste?",
  "Qual ideia antiga sua merece uma segunda chance?",
  "O que o público lembrou da última festa? E o que você queria que lembrasse?",
  "Qual seria o título do seu próximo set/EP — só pelo clima?",
];

function pick(exclude?: string): string {
  let p = PROVOCATIONS[Math.floor(Math.random() * PROVOCATIONS.length)];
  if (exclude && PROVOCATIONS.length > 1) {
    while (p === exclude) p = PROVOCATIONS[Math.floor(Math.random() * PROVOCATIONS.length)];
  }
  return p;
}

export function Brainstorming() {
  const [insight, setInsight] = useState<string>(() => pick());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  const canSend = useMemo(() => title.trim().length > 0, [title]);

  async function add() {
    if (!canSend) return;
    setBusy(true);
    try {
      await sendCapture("idea", { title: title.trim(), body: body.trim() || null });
      setRecent((r) => [title.trim(), ...r].slice(0, 30));
      setCount((n) => n + 1);
      setTitle("");
      setBody("");
      setInsight((cur) => pick(cur)); // novo insight a cada ideia
    } catch {
      /* silencioso — tenta de novo */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="row-between">
        <h2 className="screen-title">Brainstorming</h2>
        <span className="pill">{count} {count === 1 ? "ideia" : "ideias"} nesta sessão</span>
      </div>

      <section className="card insight">
        <p className="insight-text">{insight}</p>
        <button className="ghost" onClick={() => setInsight((cur) => pick(cur))}>
          Novo insight
        </button>
      </section>

      <section className="card form">
        <input
          placeholder="Solta o que vier, desenvolvemos depois"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <textarea
          rows={2}
          placeholder="Detalhes (opcional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="primary" disabled={busy || !canSend} onClick={() => void add()}>
          {busy ? "Enviando…" : "Adicionar ideia"}
        </button>
        <p className="muted small">As ideias vão pro PC revisar e entram no seu arquivo.</p>
      </section>

      {recent.length > 0 && (
        <ul className="list">
          {recent.map((t, i) => (
            <li key={i} className="item">{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
