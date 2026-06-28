import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { sendCapture } from "../capture";
import { pendingCount } from "../queue";
import { supabase } from "../supabase";
import { uploadCaptureMedia } from "../storage";
import { haptic } from "../native";

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

type Media = { kind: "audio" | "photo"; blob: Blob; mime: string; url: string };
type Ctx = { gig_id: string; gig_title: string; gig_city: string | null };

function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Capturar() {
  const [kind, setKind] = useState<Kind>("highlight");
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // §5: anexo de mídia (voz/foto) + auto-contexto (hora + GIG do dia + cidade).
  const [media, setMedia] = useState<Media | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);

  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));

  // Auto-contexto: GIG de hoje (se houver) pra pré-vincular a captura.
  useEffect(() => {
    let active = true;
    const today = localTodayISO();
    void supabase
      .from("catalog_mirror")
      .select("source_id, title, meta")
      .eq("kind", "gig")
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as { source_id: string; title: string; meta: { date?: string; city?: string | null; status?: string | null } }[];
        const g = rows.find((r) => r.meta?.date === today && r.meta.status !== "Cancelada");
        setCtx(g ? { gig_id: g.source_id, gig_title: g.title, gig_city: g.meta.city ?? null } : null);
      });
    return () => {
      active = false;
    };
  }, []);

  function clearMedia() {
    if (media) URL.revokeObjectURL(media.url);
    setMedia(null);
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        setMedia({ kind: "audio", blob, mime: blob.type || mime, url: URL.createObjectURL(blob) });
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
      void haptic("light");
    } catch {
      setMsg("Não consegui acessar o microfone.");
    }
  }

  function stopRec() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    void haptic("light");
  }

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    clearMedia();
    setMedia({ kind: "photo", blob: file, mime: file.type || "image/jpeg", url: URL.createObjectURL(file) });
  }

  function canSend(): boolean {
    if (media) return true; // voz/foto sozinha já vale
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
      let extra: Record<string, unknown> = {
        captured_at: new Date().toISOString(),
        ...(ctx ? { gig_id: ctx.gig_id, gig_title: ctx.gig_title, gig_city: ctx.gig_city } : {}),
      };
      if (media) {
        // Mídia requer internet (não cabe na fila offline em texto). Sobe ANTES
        // de enfileirar: se falhar (offline), o texto não se perde — fica no form.
        const path = await uploadCaptureMedia(media.blob, media.mime);
        extra = { ...extra, media_path: path, media_kind: media.kind, media_mime: media.mime };
      }
      await sendCapture(kind, { ...buildPayload(), ...extra });
      setF(EMPTY);
      clearMedia();
      setMsg(media ? "Capturado ✓ (com mídia) — sincroniza sozinho." : "Capturado ✓ — sincroniza sozinho.");
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

        {/* §5: anexo de voz/foto */}
        <div className="capture-media">
          <span className="label">Anexo (opcional)</span>
          <div className="cm-actions">
            {!recording ? (
              <button type="button" className="cm-btn" onClick={() => void startRec()} disabled={!!media}>
                🎤 Gravar voz
              </button>
            ) : (
              <button type="button" className="cm-btn recording" onClick={stopRec}>
                ⏹ Parar ({recSecs}s)
              </button>
            )}
            <label className={"cm-btn" + (media || recording ? " disabled" : "")}>
              📷 Foto
              <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} disabled={!!media || recording} />
            </label>
          </div>
          {media && (
            <div className="cm-preview">
              {media.kind === "photo" ? (
                <img src={media.url} alt="prévia" />
              ) : (
                <audio src={media.url} controls />
              )}
              <button type="button" className="cm-remove" onClick={clearMedia}>
                Remover
              </button>
            </div>
          )}
          <p className="muted cm-hint">
            Mídia precisa de internet pra anexar.{ctx ? ` Vai vinculada à GIG de hoje (${ctx.gig_title}).` : ""}
          </p>
        </div>

        <button className="primary" disabled={busy || !canSend()} onClick={() => void submit()}>
          {busy ? "Capturando…" : "Capturar"}
        </button>
        {msg && <p className="muted">{msg}</p>}
      </section>
    </div>
  );
}
