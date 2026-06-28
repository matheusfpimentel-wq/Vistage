import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";
import { telLink, waLink, mapsLink } from "../links";

type Kind = "all" | "gig" | "task" | "idea" | "track" | "contact" | "venue" | "class";
type Row = {
  kind: string;
  source_id: string;
  title: string;
  subtitle: string | null;
  meta: Record<string, unknown>;
};

/** Categorias do prompt inicial — só ícone (em círculo) + título. "all" = tudo. */
const CATEGORIES: { id: Kind; label: string; icon: ReactNode }[] = [
  { id: "all", label: "Todas as informações", icon: <IcLayers /> },
  { id: "gig", label: "GIGs", icon: <IcGig /> },
  { id: "task", label: "Tarefas", icon: <IcCheck /> },
  { id: "idea", label: "Ideias", icon: <IcBulb /> },
  { id: "track", label: "Músicas", icon: <IcNote /> },
  { id: "contact", label: "Pessoas", icon: <IcUser /> },
  { id: "venue", label: "Venues", icon: <IcPin /> },
  { id: "class", label: "Aulas", icon: <IcClass /> },
];
const CAT_LABEL: Record<Kind, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label])
) as Record<Kind, string>;

const KIND_LABEL: Record<string, string> = {
  gig: "GIG",
  task: "Tarefa",
  idea: "Ideia",
  track: "Música",
  contact: "Pessoa",
  venue: "Venue",
  class: "Aula",
};
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export function Buscar() {
  const [category, setCategory] = useState<Kind | null>(null);
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const inputRef = useRef<HTMLInputElement>(null);

  // Busca lê o relay (Supabase) — offline ela trava. Acompanha o estado da rede
  // pra avisar em vez de ficar girando.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const load = useCallback(async () => {
    const t = term.trim().toLowerCase();
    if (!category || !t) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!navigator.onLine) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("catalog_mirror")
      .select("kind, source_id, title, subtitle, meta")
      .order("title")
      .limit(60);
    if (category !== "all") q = q.eq("kind", category);
    q = q.ilike("search_text", `%${t}%`);
    const { data } = await q;
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [term, category]);

  // Busca ao digitar (debounce). Sem termo → nada na tela.
  useEffect(() => {
    if (!category) return;
    const id = setTimeout(() => void load(), 220);
    return () => clearTimeout(id);
  }, [load, category]);

  // Volta pro prompt de categorias.
  function back() {
    setCategory(null);
    setTerm("");
    setRows([]);
    setOpenKey(null);
  }

  // ── Prompt inicial: o que você quer pesquisar? ──────────────────────────────
  if (!category) {
    return (
      <div className="screen">
        <h2 className="screen-title">O que você quer pesquisar?</h2>
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c.id} className="cat-btn" onClick={() => setCategory(c.id)}>
              <span className="cat-ic">{c.icon}</span>
              <strong className="cat-label">{c.label}</strong>
              <span className="cat-chevron" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const t = term.trim();
  return (
    <div className="screen">
      <div className="search-head">
        <button className="iconbtn" onClick={back} aria-label="Voltar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <input
          ref={inputRef}
          className="search"
          placeholder={`Buscar em ${CAT_LABEL[category]}…`}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {t === "" ? (
        <p className="muted center-text" style={{ marginTop: "2rem" }}>
          Digite pra buscar em <strong>{CAT_LABEL[category]}</strong>.
        </p>
      ) : !online ? (
        <p className="muted center-text" style={{ marginTop: "2rem" }}>
          A busca precisa de internet. Reconecte e tente de novo.
        </p>
      ) : loading ? (
        <div className="center">
          <span className="spinner" />
        </div>
      ) : rows.length === 0 ? (
        <p className="muted">Nada encontrado.</p>
      ) : (
        <ul className="list">
          {rows.map((r) => {
            const key = `${r.kind}:${r.source_id}`;
            const open = openKey === key;
            return (
              <li key={key} className="item col" onClick={() => setOpenKey(open ? null : key)}>
                <div className="item-head">
                  <span className={"kind-ic " + r.kind} title={KIND_LABEL[r.kind] ?? r.kind} aria-label={KIND_LABEL[r.kind] ?? r.kind}>
                    {kindIcon(r.kind)}
                  </span>
                  <div className="grow">
                    <strong>{r.title}</strong>
                    {r.subtitle && <span className="muted"> · {r.subtitle}</span>}
                  </div>
                  <span className="kind-chevron" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={open ? "M18 15l-6-6-6 6" : "M9 6l6 6-6 6"} /></svg>
                  </span>
                </div>
                {open && <Detail r={r} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Detail({ r }: { r: Row }) {
  const m = r.meta ?? {};
  const out: [string, ReactNode][] = [];

  if (r.kind === "gig") {
    const st = str(m.start_time);
    if (st) out.push(["Set", `${st}${str(m.end_time) ? `–${str(m.end_time)}` : ""}`]);
    const cache = num(m.cache_amount);
    if (cache != null) out.push(["Cachê", BRL.format(cache)]);
    if (str(m.promoter_name)) out.push(["Contratante", str(m.promoter_name)]);
    if (str(m.day_contact_name)) {
      const tel = telLink(m.day_contact_phone);
      const wapp = waLink(m.day_contact_phone);
      out.push([
        "Contato do dia",
        <span className="link-row">
          {tel ? <a className="link" href={tel}>{str(m.day_contact_name)}</a> : <span>{str(m.day_contact_name)}</span>}
          {wapp && <a className="link" href={wapp} target="_blank" rel="noreferrer">WhatsApp</a>}
        </span>,
      ]);
    }
    const gmap = mapsLink(r.title, str(m.city));
    if (gmap) out.push(["Endereço", <a className="link" href={gmap} target="_blank" rel="noreferrer">Abrir no Maps</a>]);
  } else if (r.kind === "track") {
    if (num(m.bpm)) out.push(["BPM", String(num(m.bpm))]);
    if (str(m.key)) out.push(["Tom", str(m.key)]);
    if (str(m.genre)) out.push(["Gênero", str(m.genre)]);
    if (str(m.project)) out.push(["Projeto", str(m.project)]);
  } else if (r.kind === "contact") {
    if (str(m.phone)) {
      const tel = telLink(m.phone);
      const wapp = waLink(m.phone);
      out.push([
        "Telefone",
        <span className="link-row">
          {tel ? <a className="link" href={tel}>{str(m.phone)}</a> : <span>{str(m.phone)}</span>}
          {wapp && <a className="link" href={wapp} target="_blank" rel="noreferrer">WhatsApp</a>}
        </span>,
      ]);
    }
    if (str(m.email))
      out.push(["Email", <a className="link" href={`mailto:${str(m.email)}`}>{str(m.email)}</a>]);
    if (str(m.instagram)) out.push(["Instagram", str(m.instagram)]);
    if (str(m.company)) out.push(["Empresa", str(m.company)]);
  } else if (r.kind === "venue") {
    if (num(m.capacity)) out.push(["Capacidade", String(num(m.capacity))]);
    const loc = [str(m.city), str(m.state)].filter(Boolean).join(", ");
    if (loc) out.push(["Local", loc]);
    const vmap = mapsLink(r.title, str(m.city), str(m.state));
    if (vmap) out.push(["Mapa", <a className="link" href={vmap} target="_blank" rel="noreferrer">Abrir no Maps</a>]);
  } else if (r.kind === "task") {
    if (str(m.status)) out.push(["Status", str(m.status)]);
    if (str(m.priority)) out.push(["Prioridade", str(m.priority)]);
    if (str(m.due_date)) out.push(["Prazo", str(m.due_date)]);
    if (str(m.category)) out.push(["Categoria", str(m.category)]);
  } else if (r.kind === "idea") {
    if (str(m.maturation)) out.push(["Estágio", str(m.maturation)]);
    if (str(m.category)) out.push(["Categoria", str(m.category)]);
    if (str(m.body)) out.push(["Nota", str(m.body)]);
  } else if (r.kind === "class") {
    if (str(m.student_name)) out.push(["Aluno", str(m.student_name)]);
    if (str(m.date)) out.push(["Data", str(m.date)]);
    if (str(m.status)) out.push(["Status", str(m.status)]);
  }

  return (
    <div className="detail">
      {out.length > 0 && (
        <dl className="detail-rows">
          {out.map(([k, v], i) => (
            <div key={i}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {["contact", "gig", "track", "venue"].includes(r.kind) && <AnotarBox r={r} />}
    </div>
  );
}

/** Acrescenta uma anotação ao item (vai como captura aditiva pro desktop). */
function AnotarBox({ r }: { r: Row }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function anotar() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    try {
      await sendCapture("append_note", { target_kind: r.kind, target_id: r.source_id, text });
      setNote("");
      setDone(true);
    } catch {
      /* silencioso: tenta de novo */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anotar" onClick={(e) => e.stopPropagation()}>
      <textarea
        rows={2}
        value={note}
        placeholder="Anotar algo neste item…"
        onChange={(e) => {
          setNote(e.target.value);
          setDone(false);
        }}
      />
      <button className="ghost" disabled={busy || !note.trim()} onClick={() => void anotar()}>
        {busy ? "Enviando…" : done ? "Enviado ✓" : "Anotar"}
      </button>
    </div>
  );
}

// ── Ícones (inline, no estilo do app) ────────────────────────────────────────
const IP = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IcLayers() { return <svg {...IP}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>; }
function IcGig() { return <svg {...IP}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>; }
function IcCheck() { return <svg {...IP}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>; }
function IcBulb() { return <svg {...IP}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>; }
function IcNote() { return <svg {...IP}><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><path d="M9 18V5l12-2v13" /></svg>; }
function IcUser() { return <svg {...IP}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>; }
function IcPin() { return <svg {...IP}><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>; }
function IcClass() { return <svg {...IP}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" /></svg>; }

/** Ícone por tipo de resultado (no lugar do rótulo de texto). */
function kindIcon(kind: string) {
  switch (kind) {
    case "gig": return <IcGig />;
    case "task": return <IcCheck />;
    case "idea": return <IcBulb />;
    case "track": return <IcNote />;
    case "contact": return <IcUser />;
    case "venue": return <IcPin />;
    case "class": return <IcClass />;
    default: return <IcLayers />;
  }
}
