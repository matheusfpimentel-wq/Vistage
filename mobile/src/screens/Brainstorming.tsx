import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";
import { loadProvocations } from "../insights";

// Provocações com pegada de neurociência/criatividade — pra DESTRAVAR ideias.
// (Paridade com o banco do PC vem pela sincronização; aqui é o fallback.)
const PROVOCATIONS = [
  "Quantidade puxa qualidade: estudos mostram que quem gera MAIS ideias gera as melhores. Solta 3 ruins agora.",
  "Conecta mundos distantes: as ideias mais originais nascem de analogias. Que faixa sua + qual filme?",
  "Restrição liberta a criatividade: imponha um limite absurdo (set de 10 min? sem graves?) e veja o que surge.",
  "O cérebro resolve no ócio: anote a pergunta agora, a resposta vem no banho.",
  "Pensar em voz alta gera conexões novas. Descreve sua próxima GIG como se contasse pra um amigo.",
  "Inverta o problema: como você ARRUINARIA seu próximo set? A lista vira o que evitar.",
  "Se você só pudesse tocar em 1 lugar neste mês, qual seria e por quê?",
  "Que faixa sua merecia um vídeo? Como seria a cena de abertura?",
  "Quem você quer que te chame pra tocar daqui a 1 ano? O que falta?",
  "Se dobrasse seu cachê, o que mudaria no seu set?",
  "Que colaboração improvável valeria um teste?",
  "Qual ideia antiga sua merece uma segunda chance?",
  "O que o público lembrou da última festa? E o que você queria que lembrasse?",
  "Qual seria o título do seu próximo set/EP, só pelo clima?",
];

type IdeaRow = {
  source_id: string;
  title: string;
  subtitle: string | null;
  meta: { heat?: number } | null;
};

/** Ideia pronta pra o mural: id estável + calor 1..5 (pinta o card, igual ao PC). */
type GridIdea = { key: string; title: string; subtitle: string | null; heat: number };

function pick(list: string[], exclude?: string): string {
  if (list.length === 0) return "";
  let p = list[Math.floor(Math.random() * list.length)];
  if (exclude && list.length > 1) {
    while (p === exclude) p = list[Math.floor(Math.random() * list.length)];
  }
  return p;
}

function heatOf(meta: { heat?: number } | null): number {
  const r = Math.round(meta?.heat ?? 3);
  return r < 1 ? 1 : r > 5 ? 5 : r;
}

// ── Ícones inline (mínimos, sem libs/emoji): dado, lâmpada acesa, +. ──────────
function IcDie() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
/** Lâmpada ACESA — vidro preenchido (glow) + raios. */
function IcBulbLit() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" fill="currentColor" fillOpacity={0.4} />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 1.5v1.2M3.2 6l1 .6M20.8 6l-1 .6" strokeWidth={1.6} />
    </svg>
  );
}
function IcPlus() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Brainstorming() {
  // Provocações vêm do PC (provocations_mirror) p/ coincidir; fallback embutido.
  const [provs, setProvs] = useState<string[]>(PROVOCATIONS);
  const [insight, setInsight] = useState<string>(() => pick(PROVOCATIONS));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  // Ideias soltas NESTA sessão (otimistas, calor 1 = Embrião) — entram no mural
  // na hora, antes do PC ingerir e reespelhar.
  const [mine, setMine] = useState<{ title: string }[]>([]);
  // Acervo do PC (catalog_mirror) — sempre visível abaixo, em 2 colunas.
  const [archive, setArchive] = useState<IdeaRow[] | null>(null);

  const canSend = useMemo(() => title.trim().length > 0, [title]);

  useEffect(() => {
    void loadProvocations(PROVOCATIONS).then((list) => {
      setProvs(list);
      setInsight((cur) => (cur && list.includes(cur) ? cur : pick(list)));
    });
    // Carrega o acervo de ideias do arquivo (com o calor) pro mural.
    void supabase
      .from("catalog_mirror")
      .select("source_id, title, subtitle, meta")
      .eq("kind", "idea")
      .limit(200)
      .then(({ data }) => setArchive((data ?? []) as IdeaRow[]));
  }, []);

  // Mural = minhas desta sessão (calor 1) + acervo (calor real), quentes primeiro.
  // Dedupe por título pra a mesma ideia não aparecer 2x logo após o envio.
  const grid = useMemo<GridIdea[]>(() => {
    const seen = new Set<string>();
    const out: GridIdea[] = [];
    for (let i = mine.length - 1; i >= 0; i--) {
      const t = mine[i].title;
      const key = t.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key: `mine-${i}`, title: t, subtitle: "agora", heat: 1 });
    }
    const arch = (archive ?? [])
      .map((r) => ({ ...r, h: heatOf(r.meta) }))
      .sort((a, b) => b.h - a.h || a.title.localeCompare(b.title));
    for (const r of arch) {
      const key = r.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key: r.source_id, title: r.title, subtitle: r.subtitle, heat: r.h });
    }
    return out;
  }, [mine, archive]);

  async function add() {
    if (!canSend) return;
    setBusy(true);
    try {
      const t = title.trim();
      await sendCapture("idea", { title: t, body: body.trim() || null });
      setMine((r) => [...r, { title: t }]);
      setCount((n) => n + 1);
      setTitle("");
      setBody("");
      setInsight((cur) => pick(provs, cur)); // novo insight a cada ideia
    } catch {
      /* silencioso — a fila durável reenvia depois */
    } finally {
      setBusy(false);
    }
  }

  // Responder vira ideia (§7): captura a provocação atual como ideia (vai pro PC
  // revisar, igual ao desktop). Fecha o loop provocação→ideia também no celular.
  async function seedFromInsight() {
    if (!insight || busy) return;
    setBusy(true);
    try {
      const t = insight.length > 80 ? `${insight.slice(0, 77)}…` : insight;
      await sendCapture("idea", { title: t, body: insight });
      setMine((r) => [...r, { title: t }]);
      setCount((n) => n + 1);
      setInsight((cur) => pick(provs, cur));
    } catch {
      /* fila durável cobre — sobe sozinho depois */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen brainstorm">
      {/* Provocação + ações mínimas: dado (outra) · lâmpada acesa (virar ideia) */}
      <section className="card insight">
        <p className="insight-text">{insight}</p>
        <div className="insight-actions">
          <button
            className="ic-mini"
            title="Outra provocação"
            aria-label="Outra provocação"
            onClick={() => setInsight((cur) => pick(provs, cur))}
          >
            <IcDie />
          </button>
          <button
            className="ic-mini lit"
            title="Virar ideia"
            aria-label="Virar ideia"
            disabled={busy}
            onClick={() => void seedFromInsight()}
          >
            <IcBulbLit />
          </button>
        </div>
      </section>

      {/* Captura: campo + (sprint da sessão) + botão redondo de adicionar */}
      <section className="card form brainstorm-form">
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
        <div className="bs-add-row">
          <span className="round-count" title={`${count} ${count === 1 ? "ideia" : "ideias"} nesta sessão`}>
            {count}
          </span>
          <button
            className="round-add"
            aria-label="Adicionar ideia"
            title="Adicionar ideia"
            disabled={busy || !canSend}
            onClick={() => void add()}
          >
            <IcPlus />
          </button>
        </div>
      </section>

      {/* Mural: todas as ideias em 2 colunas, pintadas pelo calor (igual ao PC) */}
      {archive == null ? (
        <div className="center"><span className="spinner" /></div>
      ) : grid.length > 0 ? (
        <div className="idea-grid">
          {grid.map((it) => {
            // Post-it dimensionado pelo texto: nota curta vira cartão grande de
            // marcador, texto longo vira cartão denso — caos de mural real.
            const sz = it.title.length <= 26 ? "sz-s" : it.title.length <= 64 ? "sz-m" : "sz-l";
            return (
              <div key={it.key} className={`idea-cell heat-${it.heat} ${sz}`}>
                <strong>{it.title}</strong>
                {it.subtitle && <span className="muted small">{it.subtitle}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted center-text small">Nenhuma ideia ainda. Solta a primeira aí em cima.</p>
      )}
    </div>
  );
}
