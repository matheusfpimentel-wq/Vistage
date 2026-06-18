import { useState } from "react";
import { supabase } from "../supabase";

type Kind = "highlight" | "task" | "note";
const KINDS: { id: Kind; label: string }[] = [
  { id: "highlight", label: "Destaque" },
  { id: "task", label: "Tarefa" },
  { id: "note", label: "Nota" },
];

export function Capturar() {
  const [kind, setKind] = useState<Kind>("highlight");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const needsTitle = kind !== "note";
  const canSend = needsTitle ? title.trim().length > 0 : body.trim().length > 0;

  async function submit() {
    setBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const payload: Record<string, unknown> =
      kind === "task" ? { title } : kind === "note" ? { body } : { title, body };
    const { error } = await supabase.from("capture_inbox").insert({
      user_id: u.user?.id,
      kind,
      client_ref: crypto.randomUUID(),
      payload,
    });
    setBusy(false);
    if (error) {
      setMsg("Erro: " + error.message);
    } else {
      setMsg("Enviado! Aparece no PC na próxima sincronização.");
      setTitle("");
      setBody("");
    }
  }

  return (
    <div className="screen">
      <div className="seg">
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
        {needsTitle && (
          <label>
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "task" ? "O que fazer" : "Título"}
            />
          </label>
        )}
        <label>
          {kind === "note" ? "Nota" : "Detalhe"}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Opcional" />
        </label>
        <button className="primary" disabled={busy || !canSend} onClick={() => void submit()}>
          {busy ? "Enviando…" : "Enviar pro PC"}
        </button>
        {msg && <p className="muted">{msg}</p>}
      </section>
    </div>
  );
}
