import { useState } from "react";
import { sendCapture } from "../capture";
import { pendingCount } from "../queue";
import { addLocalGig } from "../localGigs";

type Kind = "highlight" | "task" | "note" | "contact" | "gig";
const KINDS: { id: Kind; label: string }[] = [
  { id: "highlight", label: "Destaque" },
  { id: "task", label: "Tarefa" },
  { id: "note", label: "Nota" },
  { id: "contact", label: "Pessoa" },
  { id: "gig", label: "GIG" },
];

type Form = {
  title: string;
  body: string;
  name: string;
  phone: string;
  email: string;
  instagram: string;
  city: string;
  venue_name: string;
  date: string;
  cache: string;
};
const EMPTY: Form = {
  title: "", body: "", name: "", phone: "", email: "", instagram: "",
  city: "", venue_name: "", date: "", cache: "",
};

export function Capturar() {
  const [kind, setKind] = useState<Kind>("highlight");
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));

  function canSend(): boolean {
    if (kind === "note") return f.body.trim().length > 0;
    if (kind === "contact") return f.name.trim().length > 0;
    if (kind === "gig") return f.venue_name.trim().length > 0;
    return f.title.trim().length > 0; // highlight, task
  }

  function buildPayload(): Record<string, unknown> {
    switch (kind) {
      case "task":
        return { title: f.title, description: f.body || null };
      case "note":
        return { body: f.body };
      case "contact":
        return {
          name: f.name,
          phone: f.phone || null,
          email: f.email || null,
          instagram: f.instagram || null,
          city: f.city || null,
          notes: f.body || null,
        };
      case "gig":
        return {
          venue_name: f.venue_name,
          date: f.date || null,
          city: f.city || null,
          cache_amount: f.cache ? Number(f.cache) : null,
          notes: f.body || null,
        };
      default: // highlight
        return { title: f.title, body: f.body || null };
    }
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await sendCapture(kind, buildPayload());
      // GIG: guarda local pra aparecer JÁ no celular (Buscar/Hoje), sem esperar o
      // PC processar o espelho. Some sozinha quando a GIG real chega do PC.
      if (kind === "gig") {
        await addLocalGig({
          venue_name: f.venue_name.trim(),
          date: f.date || null,
          city: f.city || null,
          cache_amount: f.cache ? Number(f.cache) : null,
          notes: f.body || null,
        });
      }
      setF(EMPTY);
      setMsg(kind === "gig" ? "GIG criada ✓ · já aparece aqui e sobe pro PC." : "Capturado ✓ · sincroniza sozinho.");
      // Dá um instante pro flush (online) terminar e confirma a subida.
      await new Promise((r) => setTimeout(r, 700));
      if ((await pendingCount()) === 0) setMsg("Sincronizado ✓ no PC.");
    } catch (e) {
      setMsg("Erro ao capturar: " + ((e as Error).message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="seg seg-scroll">
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={kind === k.id ? "active" : ""}
            onClick={() => {
              setKind(k.id);
              setMsg(null);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      <section className="card form">
        {(kind === "highlight" || kind === "task") && (
          <label>
            Título
            <input
              value={f.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={kind === "task" ? "O que fazer" : "Título"}
            />
          </label>
        )}

        {kind === "contact" && (
          <>
            <label>
              Nome
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nome da pessoa" />
            </label>
            <label>
              Telefone
              <input value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="Opcional" />
            </label>
            <label>
              Instagram
              <input value={f.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="@ (opcional)" />
            </label>
            <label>
              Email
              <input value={f.email} onChange={(e) => set({ email: e.target.value })} inputMode="email" placeholder="Opcional" />
            </label>
            <label>
              Cidade
              <input value={f.city} onChange={(e) => set({ city: e.target.value })} placeholder="Opcional" />
            </label>
          </>
        )}

        {kind === "gig" && (
          <>
            <label>
              Local / casa
              <input value={f.venue_name} onChange={(e) => set({ venue_name: e.target.value })} placeholder="Nome da casa/evento" />
            </label>
            <label>
              Data
              <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label>
              Cidade
              <input value={f.city} onChange={(e) => set({ city: e.target.value })} placeholder="Opcional" />
            </label>
            <label>
              Cachê (R$)
              <input value={f.cache} onChange={(e) => set({ cache: e.target.value })} inputMode="numeric" placeholder="Opcional" />
            </label>
          </>
        )}

        <label>
          {kind === "note" ? "Nota" : kind === "contact" || kind === "gig" ? "Observações" : "Detalhe"}
          <textarea
            value={f.body}
            onChange={(e) => set({ body: e.target.value })}
            rows={kind === "note" ? 5 : 3}
            placeholder={kind === "note" ? "" : "Opcional"}
          />
        </label>

        <button className="primary" disabled={busy || !canSend()} onClick={() => void submit()}>
          {busy ? "Capturando…" : "Capturar"}
        </button>
        {msg && <p className="muted">{msg}</p>}
      </section>
    </div>
  );
}
