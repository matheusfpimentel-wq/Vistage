import { create } from "zustand";

export type Theme = "light" | "dark";
export type Accent = "violet" | "blue" | "emerald" | "rose" | "amber" | "cyan";

const LS_THEME = "vistage.theme";
const LS_ACCENT = "vistage.accent";

type AccentDef = {
  id: Accent;
  label: string;
  /** HSL do swatch mostrado na UI. */
  swatch: string;
  primaryLight: string;
  primaryDark: string;
  glowLight: string;
  glowDark: string;
};

// Cada esquema muda a cor de destaque (primary/ring/glow) — o resto do tema
// (fundos, texto) segue claro/escuro. Valores em HSL "H S% L%".
export const ACCENTS: AccentDef[] = [
  { id: "violet",  label: "Violeta",   swatch: "263 80% 68%", primaryLight: "262 70% 56%", primaryDark: "263 80% 68%", glowLight: "271 76% 65%", glowDark: "280 85% 72%" },
  { id: "blue",    label: "Azul",      swatch: "213 90% 66%", primaryLight: "217 91% 56%", primaryDark: "213 90% 66%", glowLight: "199 89% 62%", glowDark: "199 90% 70%" },
  { id: "emerald", label: "Esmeralda", swatch: "158 68% 50%", primaryLight: "158 75% 38%", primaryDark: "158 68% 50%", glowLight: "168 72% 46%", glowDark: "165 72% 56%" },
  { id: "rose",    label: "Rosa",      swatch: "345 82% 66%", primaryLight: "346 80% 56%", primaryDark: "345 82% 66%", glowLight: "330 80% 63%", glowDark: "332 85% 70%" },
  { id: "amber",   label: "Âmbar",     swatch: "38 92% 56%",  primaryLight: "32 95% 48%",  primaryDark: "38 92% 56%",  glowLight: "45 95% 56%",  glowDark: "45 95% 62%" },
  { id: "cyan",    label: "Ciano",     swatch: "188 82% 52%", primaryLight: "190 85% 40%", primaryDark: "188 82% 52%", glowLight: "198 88% 50%", glowDark: "196 86% 60%" },
];

type ThemeState = {
  theme: Theme;
  accent: Accent;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  toggle: () => void;
  hydrate: () => void;
};

function applyAccent(accent: Accent, theme: Theme) {
  const def = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];
  const dark = theme === "dark";
  const s = document.documentElement.style;
  const primary = dark ? def.primaryDark : def.primaryLight;
  // Inline no <html> sobrepõe os defaults do :root / .dark do index.css.
  s.setProperty("--primary", primary);
  s.setProperty("--primary-glow", dark ? def.glowDark : def.glowLight);
  s.setProperty("--ring", primary);
}

function applyToDom(theme: Theme, accent: Accent) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  applyAccent(accent, theme);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  accent: "violet",
  setTheme(t) {
    localStorage.setItem(LS_THEME, t);
    applyToDom(t, get().accent);
    set({ theme: t });
  },
  setAccent(a) {
    localStorage.setItem(LS_ACCENT, a);
    applyAccent(a, get().theme);
    set({ accent: a });
  },
  toggle() {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
  hydrate() {
    // Dark é o padrão. Só respeitamos uma escolha explícita salva.
    const storedTheme = localStorage.getItem(LS_THEME) as Theme | null;
    const theme: Theme = storedTheme === "light" ? "light" : "dark";
    const storedAccent = localStorage.getItem(LS_ACCENT) as Accent | null;
    const accent: Accent = ACCENTS.some((a) => a.id === storedAccent)
      ? (storedAccent as Accent)
      : "violet";
    applyToDom(theme, accent);
    set({ theme, accent });
  },
}));
