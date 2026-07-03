import { useEffect, useState } from "react";
import { loadTotalGigs, updateArtistName, type HeaderInfo } from "../identity";
import { isEnergyEnabled, setEnergyEnabled } from "../lib/energy";
import { isBiometricEnabled, setBiometricEnabled, biometricOfferable, biometricVerify } from "../lib/biometric";

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
  const [energyOn, setEnergyOn] = useState(isEnergyEnabled());
  const [energyHelp, setEnergyHelp] = useState(false);
  const [bioOn, setBioOn] = useState(isBiometricEnabled());
  const [bioHelp, setBioHelp] = useState(false);

  async function toggleBio() {
    if (bioOn) {
      setBioOn(false);
      setBiometricEnabled(false);
      return;
    }
    // Ao ligar, confirma que a biometria funciona antes de passar a trancar —
    // evita ficar preso na tela de bloqueio depois.
    const ok = await biometricVerify("Confirmar biometria");
    if (ok) {
      setBioOn(true);
      setBiometricEnabled(true);
    }
  }

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
            {saving ? "Enviando…" : saved ? "Enviado ✓ · revisar no PC" : "Salvar nome"}
          </button>

          <div className="identity-stats">
            <div>
              <span className="label">GIGs</span>
              <strong className="big">{gigs ?? "…"}</strong>
            </div>
            <div>
              <span className="label">Streak</span>
              <strong className="big" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2c1 3 3 4.5 4.5 6.5C18 10.5 19 12.4 19 14.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.3 1.3 2.2 2.5 2.2a2.5 2.5 0 0 0 2.5-2.5c0-1.4-.8-2.2-1.3-3.2C10.7 6.3 11 4 12 2z" /></svg>
                {info.streak}
              </strong>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row-label">
              Pergunta de energia
              <button
                type="button"
                className="settings-hint"
                onClick={() => setEnergyHelp((v) => !v)}
                aria-label="O que é isso"
                aria-expanded={energyHelp}
              >
                ?
              </button>
            </span>
            <button
              type="button"
              className={"toggle" + (energyOn ? " on" : "")}
              role="switch"
              aria-checked={energyOn}
              aria-label="Pergunta de energia"
              onClick={() => {
                const v = !energyOn;
                setEnergyOn(v);
                setEnergyEnabled(v);
              }}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          {energyHelp && (
            <p className="settings-note">
              De vez em quando (no máx. 2×/dia) a Hoje pergunta seu nível de energia num toque. Responder no momento é mais preciso que lembrar depois — alimenta o mapa de energia por dia e horário no PC.
            </p>
          )}

          {biometricOfferable() && (
            <>
              <div className="settings-row">
                <span className="settings-row-label">
                  Exigir biometria ao abrir
                  <button
                    type="button"
                    className="settings-hint"
                    onClick={() => setBioHelp((v) => !v)}
                    aria-label="O que é isso"
                    aria-expanded={bioHelp}
                  >
                    ?
                  </button>
                </span>
                <button
                  type="button"
                  className={"toggle" + (bioOn ? " on" : "")}
                  role="switch"
                  aria-checked={bioOn}
                  aria-label="Exigir biometria ao abrir"
                  onClick={() => void toggleBio()}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
              {bioHelp && (
                <p className="settings-note">
                  Pede Face ID / digital ao abrir o app. A verificação é local — nada sai do aparelho.
                </p>
              )}
            </>
          )}

          <div className="identity-actions">
            <button className="ghost full" onClick={onToggleTheme} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}>
              {theme === "dark" ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                  Modo claro
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
                  Modo escuro
                </>
              )}
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
