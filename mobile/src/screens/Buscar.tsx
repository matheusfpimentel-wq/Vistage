import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";

type Kind = "all" | "gig" | "track" | "contact" | "venue";
type Row = {
  kind: string;
  source_id: string;
  title: string;
  subtitle: string | null;
  meta: Record<string, unknown>;
};

const KIND_TABS: { id: Kind; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "gig", label: "GIGs" },
  { id: "track", label: "Músicas" },
  { id: "contact", label: "Pessoas" },
  { id: "venue", label: "Venues" },
];
const KIND_LABEL: Record<string, string> = {
  gig: "GIG",
  track: "Música",
  contact: "Pessoa",
  venue: "Venue",
};
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function wa(phone: unknown): string | null {
  return typeof phone === "string" && phone.trim() ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

export function Buscar() {
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("catalog_mirror")
      .select("kind, source_id, title, subtitle, meta")
      .order("title")
      .limit(60);
    if (kind !== "all") q = q.eq("kind", kind);
    const t = term.trim().toLowerCase();
    if (t) q = q.ilike("search_text", `%${t}%`);
    const { data } = await q;
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [term, kind]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 220);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <div className="screen">
      <input
        className="search"
        placeholder="Buscar GIGs, músicas, pessoas…"
        value={term}
        autoFocus
        onChange={(e) => setTerm(e.target.value)}
      />
      <div className="seg seg-scroll">
        {KIND_TABS.map((k) => (
          <button key={k.id} className={kind === k.id ? "active" : ""} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {loading ? (
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
                  <span className={"tag " + r.kind}>{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <div className="grow">
                    <strong>{r.title}</strong>
                    {r.subtitle && <span className="muted"> · {r.subtitle}</span>}
                  </div>
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
      const link = wa(m.day_contact_phone);
      out.push([
        "Contato do dia",
        link ? (
          <a className="link" href={link} target="_blank" rel="noreferrer">
            {str(m.day_contact_name)} · WhatsApp
          </a>
        ) : (
          str(m.day_contact_name)
        ),
      ]);
    }
  } else if (r.kind === "track") {
    if (num(m.bpm)) out.push(["BPM", String(num(m.bpm))]);
    if (str(m.key)) out.push(["Tom", str(m.key)]);
    if (str(m.genre)) out.push(["Gênero", str(m.genre)]);
    if (str(m.project)) out.push(["Projeto", str(m.project)]);
  } else if (r.kind === "contact") {
    const link = wa(m.phone);
    if (str(m.phone))
      out.push([
        "Telefone",
        link ? (
          <a className="link" href={link} target="_blank" rel="noreferrer">
            {str(m.phone)} · WhatsApp
          </a>
        ) : (
          str(m.phone)
        ),
      ]);
    if (str(m.email))
      out.push(["Email", <a className="link" href={`mailto:${str(m.email)}`}>{str(m.email)}</a>]);
    if (str(m.instagram)) out.push(["Instagram", str(m.instagram)]);
    if (str(m.company)) out.push(["Empresa", str(m.company)]);
  } else if (r.kind === "venue") {
    if (num(m.capacity)) out.push(["Capacidade", String(num(m.capacity))]);
    const loc = [str(m.city), str(m.state)].filter(Boolean).join(", ");
    if (loc) out.push(["Local", loc]);
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
      <AnotarBox r={r} />
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
