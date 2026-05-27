import { create } from "zustand";

export type Theme = "light" | "dark";
const LS_KEY = "musicgest.theme";

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
    const stored = localStorage.getItem(LS_KEY) as Theme | null;
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    applyToDom(initial);
    set({ theme: initial });
  },
}));
