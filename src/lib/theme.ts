import { create } from "zustand";
import { getDb } from "./db";

export type Theme = "light" | "dark";
export type Accent =
  | "violet"
  | "blue"
  | "emerald"
  | "rose"
  | "amber"
  | "cyan"
  | "bordo"
  | "teal"
  | "indigo"
  | "fuchsia"
  | "orange"
  | "lime"
  | "slate";
/** Layout do menu lateral no desktop: clássico (rótulos) ou rail compacto (ícones). */
export type SidebarLayout = "classic" | "rail";

// Cache local pra pintar sem flash no boot; a FONTE DA VERDADE é a tabela
// document_settings (viaja com o .vistage).
const LS_THEME = "vistage.theme";
const LS_ACCENT = "vistage.accent";
const LS_SIDEBAR = "vistage.sidebarLayout";

async function saveDocSetting(key: string, value: string): Promise<void> {
  try {
    await getDb().execute(
      `INSERT INTO document_settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
      [key, value]
    );
  } catch {
    /* banco ainda não pronto: o cache local cobre até o hydrateFromDocument */
  }
}

/**
 * Grava a aparência atual (tema + cor de destaque) em document_settings — a
 * fonte da verdade que viaja no .vistage. Chamado antes de exportar o documento
 * pra garantir que a aparência SEMPRE acompanhe o arquivo, mesmo logo após um
 * boot em branco em que document_settings ainda não tenha sido escrito.
 */
export async function persistAppearanceToDocument(): Promise<void> {
  const { theme, accent, sidebarLayout } = useThemeStore.getState();
  await saveDocSetting("theme", theme);
  await saveDocSetting("accent", accent);
  await saveDocSetting("sidebarLayout", sidebarLayout);
}

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
  { id: "bordo",   label: "Bordô",     swatch: "345 58% 35%", primaryLight: "345 60% 33%", primaryDark: "345 62% 52%", glowLight: "350 60% 45%", glowDark: "345 68% 60%" },
  { id: "teal",    label: "Teal",      swatch: "174 72% 43%", primaryLight: "175 84% 32%", primaryDark: "173 70% 47%", glowLight: "182 70% 42%", glowDark: "178 72% 54%" },
  { id: "indigo",  label: "Índigo",    swatch: "243 76% 66%", primaryLight: "244 65% 56%", primaryDark: "243 78% 68%", glowLight: "250 78% 65%", glowDark: "252 84% 72%" },
  { id: "fuchsia", label: "Fúcsia",    swatch: "291 74% 62%", primaryLight: "291 68% 50%", primaryDark: "292 76% 64%", glowLight: "300 76% 58%", glowDark: "300 82% 67%" },
  { id: "orange",  label: "Laranja",   swatch: "25 92% 55%",  primaryLight: "22 90% 47%",  primaryDark: "25 92% 56%",  glowLight: "32 94% 54%",  glowDark: "30 92% 60%" },
  { id: "lime",    label: "Lima",      swatch: "96 55% 45%",  primaryLight: "100 60% 35%", primaryDark: "96 52% 47%",  glowLight: "108 58% 43%", glowDark: "100 58% 53%" },
  { id: "slate",   label: "Ardósia",   swatch: "215 22% 52%", primaryLight: "215 28% 40%", primaryDark: "214 20% 60%", glowLight: "215 25% 50%", glowDark: "215 22% 63%" },
];

type ThemeState = {
  theme: Theme;
  accent: Accent;
  sidebarLayout: SidebarLayout;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  setSidebarLayout: (l: SidebarLayout) => void;
  toggle: () => void;
  hydrate: () => void;
  hydrateFromDocument: () => Promise<void>;
};

/**
 * Aplica a cor de destaque (primary/ring/glow/accent) no <html>. Exportada
 * porque a mini-janela de foco (overlay) precisa pintar a cor escolhida sem
 * carregar todo o ciclo de boot do tema — recebe accent + theme via URL.
 */
/** Tokens neutros que um modo de cor antigo podia ter pintado inline; limpamos
 *  sempre pra valer o :root/.dark do index.css. */
const COLOR_MODE_TOKENS = [
  "--background", "--foreground", "--card", "--card-foreground",
  "--popover", "--popover-foreground", "--secondary", "--secondary-foreground",
  "--muted", "--muted-foreground", "--border", "--input",
] as const;

export function applyAccent(accent: Accent, theme: Theme) {
  const def = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];
  const dark = theme === "dark";
  const s = document.documentElement.style;
  const primary = dark ? def.primaryDark : def.primaryLight;
  // Inline no <html> sobrepõe os defaults do :root / .dark do index.css.
  s.setProperty("--primary", primary);
  s.setProperty("--primary-glow", dark ? def.glowDark : def.glowLight);
  s.setProperty("--ring", primary);
  // O hover dos menus/botões usa --accent. Sem atualizar aqui, ele fica SEMPRE
  // violeta (o default do index.css) mesmo trocando a cor de destaque. Fazemos
  // o hover (e seu texto) seguirem o mesmo matiz do destaque escolhido.
  const hue = primary.split(" ")[0];
  s.setProperty("--accent", dark ? `${hue} 35% 22%` : `${hue} 60% 95%`);
  s.setProperty("--accent-foreground", dark ? `${hue} 20% 96%` : `${hue} 50% 25%`);
  // Limpa quaisquer tokens neutros que um "modo cor" antigo tenha deixado inline.
  for (const t of COLOR_MODE_TOKENS) s.removeProperty(t);
}

function applyToDom(theme: Theme, accent: Accent) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  applyAccent(accent, theme);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  accent: "violet",
  sidebarLayout: "classic",
  setTheme(t) {
    localStorage.setItem(LS_THEME, t);
    void saveDocSetting("theme", t);
    applyToDom(t, get().accent);
    set({ theme: t });
  },
  setAccent(a) {
    localStorage.setItem(LS_ACCENT, a);
    void saveDocSetting("accent", a);
    applyAccent(a, get().theme);
    set({ accent: a });
  },
  setSidebarLayout(l) {
    localStorage.setItem(LS_SIDEBAR, l);
    void saveDocSetting("sidebarLayout", l);
    set({ sidebarLayout: l });
  },
  toggle() {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
  hydrate() {
    // Dark é o padrão. Só respeitamos uma escolha explícita salva. ("color" era
    // um 3º tema removido — migra pra claro, que era a base dele.)
    const storedTheme = localStorage.getItem(LS_THEME);
    const theme: Theme =
      storedTheme === "light" || storedTheme === "color" ? "light" : "dark";
    const storedAccent = localStorage.getItem(LS_ACCENT) as Accent | null;
    const accent: Accent = ACCENTS.some((a) => a.id === storedAccent)
      ? (storedAccent as Accent)
      : "violet";
    const storedSidebar = localStorage.getItem(LS_SIDEBAR);
    const sidebarLayout: SidebarLayout = storedSidebar === "rail" ? "rail" : "classic";
    applyToDom(theme, accent);
    set({ theme, accent, sidebarLayout });
  },
  /**
   * Aplica o tema salvo NO DOCUMENTO (document_settings). Chamado após o banco
   * abrir / ao abrir um .vistage — assim a aparência viaja com o arquivo. Se o
   * documento não definir nada, mantém o que já está (cache local / default).
   */
  async hydrateFromDocument() {
    try {
      const rows = await getDb().select<{ key: string; value: string }[]>(
        "SELECT key, value FROM document_settings WHERE key IN ('theme','accent','sidebarLayout')"
      );
      const map = new Map(rows.map((r) => [r.key, r.value]));
      const dt = map.get("theme");
      const da = map.get("accent");
      const ds = map.get("sidebarLayout");
      const theme: Theme =
        dt === "dark" ? "dark" : dt === "light" || dt === "color" ? "light" : get().theme;
      const accent: Accent = ACCENTS.some((a) => a.id === da) ? (da as Accent) : get().accent;
      const sidebarLayout: SidebarLayout = ds === "rail" || ds === "classic" ? ds : get().sidebarLayout;
      localStorage.setItem(LS_THEME, theme);
      localStorage.setItem(LS_ACCENT, accent);
      localStorage.setItem(LS_SIDEBAR, sidebarLayout);
      applyToDom(theme, accent);
      set({ theme, accent, sidebarLayout });
    } catch {
      /* sem document_settings (banco antigo) — ignora */
    }
  },
}));
