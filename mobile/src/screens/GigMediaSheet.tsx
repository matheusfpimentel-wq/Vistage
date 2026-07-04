import { useEffect, useState } from "react";
import { haptic } from "../native";
import { pickMedia, prepareMedia, type PickedMedia } from "../media";
import { enqueueMedia } from "../mediaQueue";

/**
 * §5 — captura foto/clipe no contexto da GIG. Vai pro PC como matéria-prima do
 * Conteúdo (aftermovie, stories). Offline-first: o binário fica guardado no
 * aparelho até subir. A foto é comprimida; o clipe tem teto por arquivo.
 */

function XIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

export function GigMediaSheet({
  gigId,
  gigTitle,
  onClose,
}: {
  gigId: number | null;
  gigTitle: string;
  onClose: () => void;
}) {
  const [staged, setStaged] = useState<PickedMedia | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [help, setHelp] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!staged) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(staged.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [staged]);

  async function pick(kind: "image" | "video") {
    setErr(null);
    const file = await pickMedia(kind);
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareMedia(file);
      if ("error" in prepared) {
        setErr(prepared.error);
        return;
      }
      setStaged(prepared);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!staged) return;
    setBusy(true);
    void haptic("medium");
    try {
      await enqueueMedia({
        blob: staged.blob,
        gig_id: gigId,
        media_kind: staged.mediaKind,
        ext: staged.ext,
        mime: staged.mime,
        caption: caption.trim() || null,
      });
      setStaged(null);
      setCaption("");
      setSent((c) => c + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet media-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Foto/clipe · {gigTitle}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar"><XIcon /></button>
        </div>

        <p className="media-hint">
          Registre o momento da GIG.
          <button
            type="button"
            className="settings-hint"
            onClick={() => setHelp((v) => !v)}
            aria-label="O que é isso"
            aria-expanded={help}
          >
            ?
          </button>
        </p>
        {help && (
          <p className="settings-note">
            Foto e clipe entram no PC como matéria-prima do Conteúdo (semente de aftermovie/stories). A foto é comprimida e o clipe tem teto de 25 MB pra não pesar. Fica guardado no aparelho até subir — dá pra capturar offline.
          </p>
        )}

        {gigId == null && (
          <p className="muted small" style={{ margin: 0 }}>
            Esta GIG ainda não sincronizou com o PC — a mídia vai sem vínculo de GIG.
          </p>
        )}

        {!staged ? (
          <div className="media-pick">
            <button className="media-pick-btn" disabled={busy} onClick={() => void pick("image")}>
              📷 Foto
            </button>
            <button className="media-pick-btn" disabled={busy} onClick={() => void pick("video")}>
              🎬 Clipe
            </button>
          </div>
        ) : (
          <div className="media-stage">
            <div className="media-preview">
              {staged.mediaKind === "clip" ? (
                <video src={previewUrl ?? undefined} muted playsInline controls />
              ) : (
                <img src={previewUrl ?? undefined} alt="" />
              )}
            </div>
            <input
              className="checkin-search"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Legenda (opcional)"
            />
            <div className="media-actions">
              <button className="ghost" disabled={busy} onClick={() => { setStaged(null); setCaption(""); }}>
                Trocar
              </button>
              <button className="primary" disabled={busy} onClick={() => void send()}>
                {busy ? "Guardando…" : "Enviar"}
              </button>
            </div>
          </div>
        )}

        {err && <p className="media-err">{err}</p>}
        {sent > 0 && !staged && (
          <p className="muted small" style={{ margin: "0.5rem 0 0" }}>
            {sent} mídia(s) na fila · entram no Conteúdo do PC.
          </p>
        )}
      </div>
    </div>
  );
}
