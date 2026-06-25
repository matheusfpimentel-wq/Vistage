import { useEffect, useState } from "react";
import { loadTotalGigs, updateArtistName, type HeaderInfo } from "../identity";

/**
 * Folha de identidade — abre ao tocar no isótipo/nome no header. Mostra isótipo,
 * nome artístico (editável → captura pro PC), total de GIGs e streak, além de
 * tema e sair. Isótipo e demais campos são editados no PC.
 */
export function IdentitySheet({
  open,
  onClose,
  info,
  onReload,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  info: HeaderInfo;
  onReload: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(info.artistName ?? "");
  const [gigs, setGigs] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(info.artistName ?? "");
    setSaved(false);
    void loadTotalGigs().then(setGigs);
  }, [open, info.artistName]);

  if (!open) return null;

  const dirty = name.trim() !== "" && name.trim() !== (info.artistName ?? "");

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await updateArtistName(name);
      setSaved(true);
      onReload();
    } catch {
      /* tenta de novo */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Identidade</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="identity-sheet">
          <div className="identity-hero">
            {info.isotype ? (
              <img className="identity-iso" src={info.isotype} alt="Isótipo" />
            ) : (
              <span className="identity-mono">{(name || info.artistName || "V").slice(0, 1).toUpperCase()}</span>
            )}
          </div>

          <label>
            Nome artístico
            <input
              value={name}
              placeholder="Seu nome artístico"
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <button className="primary" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Enviando…" : saved ? "Enviado ✓ — revisar no PC" : "Salvar nome"}
          </button>

          <div className="identity-stats">
            <div>
              <span className="label">GIGs</span>
              <strong className="big">{gigs ?? "…"}</strong>
            </div>
            <div>
              <span className="label">Streak</span>
              <strong className="big">🔥 {info.streak}</strong>
            </div>
          </div>

          <div className="identity-actions">
            <button className="ghost full" onClick={onToggleTheme}>
              {theme === "dark" ? "☀️ Modo claro" : "🌙 Modo escuro"}
            </button>
            <button className="ghost full" onClick={onSignOut}>
              Sair da conta
            </button>
          </div>

          <p className="muted small">
            O isótipo e o resto da identidade são editados no PC. Mudanças aqui entram na revisão de capturas.
          </p>
        </div>
      </div>
    </div>
  );
}
