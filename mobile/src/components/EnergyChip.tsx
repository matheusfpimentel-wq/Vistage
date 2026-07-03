import { useState } from "react";
import { sendCapture } from "../capture";
import { haptic } from "../native";
import { pendingEnergyWindow, resolveEnergyWindow } from "../lib/energy";

/**
 * Pergunta de energia em 1 toque (EMA). Aparece só dentro de uma janela do dia
 * ainda não respondida; some ao responder ou dispensar. Envia `energy_log
 * {level, at}` pra fila offline — o desktop agrega no heatmap dia×hora.
 */
export function EnergyChip() {
  const [win, setWin] = useState<number | null>(() => pendingEnergyWindow());
  if (win == null) return null;

  async function pick(level: number) {
    resolveEnergyWindow(win!);
    setWin(null);
    void haptic("light");
    try {
      await sendCapture("energy_log", { level, at: new Date().toISOString() });
    } catch {
      /* a fila reenvia sozinha */
    }
  }
  function dismiss() {
    resolveEnergyWindow(win!);
    setWin(null);
  }

  return (
    <div className="energy-chip">
      <div className="energy-chip-top">
        <span className="energy-chip-q">Como tá a energia?</span>
        <button type="button" className="energy-x" onClick={dismiss} aria-label="Agora não">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="energy-scale" role="group" aria-label="Nível de energia de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className="energy-dot" onClick={() => void pick(n)} aria-label={`${n} de 5`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
