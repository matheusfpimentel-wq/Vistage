// EMA — Ecological Momentary Assessment. Autoavaliação NO momento supera o
// relato retrospectivo em precisão (Shiffman, Stone & Hufford 2008): o recall
// distorce, a amostragem no momento reduz o viés. Por isso a pergunta de energia
// aparece na hora, no máximo 2×/dia, e nunca insiste — ignorou, some até a
// próxima janela.

import { localToday } from "./dates";

const ENABLED_KEY = "vistage.energy.enabled";
const STATE_KEY = "vistage.energy.state";

// Janelas padrão (hora local): manhã e fim de tarde. [início, fim) em horas.
export const ENERGY_WINDOWS: readonly (readonly [number, number])[] = [
  [8, 11],
  [16, 19],
];

/** Ligado por padrão; guardado como "0"/"1" (desligável nos ajustes). */
export function isEnergyEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setEnergyEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage indisponível — segue com o padrão */
  }
}

type WinState = { date: string; done: number[] };
function readState(): WinState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as WinState;
      if (s && s.date === localToday() && Array.isArray(s.done)) return s;
    }
  } catch {
    /* estado corrompido — recomeça o dia */
  }
  return { date: localToday(), done: [] };
}

/** Índice da janela ativa agora (0/1), ou null fora de janela. */
export function activeEnergyWindow(now: Date = new Date()): number | null {
  const h = now.getHours();
  for (let i = 0; i < ENERGY_WINDOWS.length; i++) {
    const [a, b] = ENERGY_WINDOWS[i];
    if (h >= a && h < b) return i;
  }
  return null;
}

/** Janela pendente agora: habilitado + dentro de janela + ainda não resolvida hoje. */
export function pendingEnergyWindow(now: Date = new Date()): number | null {
  if (!isEnergyEnabled()) return null;
  const w = activeEnergyWindow(now);
  if (w == null) return null;
  return readState().done.includes(w) ? null : w;
}

/** Marca a janela como resolvida hoje (respondida OU dispensada). */
export function resolveEnergyWindow(win: number): void {
  const s = readState();
  if (!s.done.includes(win)) {
    s.done.push(win);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch {
      /* storage indisponível */
    }
  }
}
