import { create } from "zustand";

export type Theme = "light" | "dark";
const LS_KEY = "vistage.theme";

type ThemeState = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  hydrate: () => void;
};

function applyToDom(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  setTheme(t) {
    localStorage.setItem(LS_KEY, t);
    applyToDom(t);
    set({ theme: t });
  },
  toggle() {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
  hydrate() {
    // Dark é o padrão. Só respeitamos uma escolha explícita do usuário
    // salva no localStorage; não tentamos adivinhar pelo SO.
    const stored = localStorage.getItem(LS_KEY) as Theme | null;
    const initial: Theme = stored === "light" ? "light" : "dark";
    applyToDom(initial);
    set({ theme: initial });
  },
}));
