import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";

// Provocações com pegada de neurociência/criatividade — pra DESTRAVAR ideias.
// (Paridade com o banco do PC vem pela sincronização; aqui é o fallback.)
const PROVOCATIONS = [
  "Quantidade puxa qualidade: estudos mostram que quem gera MAIS ideias gera as melhores. Solta 3 ruins agora.",
  "Conecta mundos distantes — as ideias mais originais nascem de analogias. Que faixa sua + qual filme?",
  "Restrição liberta a criatividade: imponha um limite absurdo (set de 10 min? sem graves?) e veja o que surge.",
  "O cérebro resolve no ócio: anote a pergunta agora, a resposta vem no banho.",
  "Pensar em voz alta gera conexões novas. Descreve sua próxima GIG como se contasse pra um amigo.",
  "Inverta o problema: como você ARRUINARIA seu próximo set? A lista vira o que evitar.",
  "Se você só pudesse tocar em 1 lugar neste mês, qual seria — e por quê?",
  "Que faixa sua merecia um vídeo? Como seria a cena de abertura?",
  "Quem você quer que te chame pra tocar daqui a 1 ano? O que falta?",
  "Se dobrasse seu cachê, o que mudaria no seu set?",
  "Que colaboração improvável valeria um teste?",
  "Qual ideia antiga sua merece uma segunda chance?",
  "O que o público lembrou da última festa? E o que você queria que lembrasse?",
  "Qual seria o título do seu próximo set/EP — só pelo clima?",
];

type IdeaRow = { source_id: string; title: string; subtitle: string | null };

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

  // "Consultar outras ideias" — as ideias que já estão no arquivo do PC.
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<IdeaRow[] | null>(null);
  const [loadingOthers, setLoadingOthers] = useState(false);

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

  async function toggleOthers() {
    const next = !showOthers;
    setShowOthers(next);
    if (next && others == null) {
      setLoadingOthers(true);
      const { data } = await supabase
        .from("catalog_mirror")
        .select("source_id, title, subtitle")
        .eq("kind", "idea")
        .order("title")
        .limit(100);
      setOthers((data ?? []) as IdeaRow[]);
      setLoadingOthers(false);
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

      {/* Consultar outras ideias (as que já estão no PC) */}
      <button className="ghost full" onClick={() => void toggleOthers()}>
        {showOthers ? "Esconder outras ideias" : "Consultar outras ideias"}
      </button>
      {showOthers && (
        loadingOthers ? (
          <div className="center"><span className="spinner" /></div>
        ) : others && others.length > 0 ? (
          <ul className="list">
            {others.map((o) => (
              <li key={o.source_id} className="item col">
                <strong>{o.title}</strong>
                {o.subtitle && <span className="muted small">{o.subtitle}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted center-text">Nenhuma ideia no arquivo ainda. (Sincronize no PC.)</p>
        )
      )}
    </div>
  );
}
