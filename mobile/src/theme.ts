// Aparência espelhada do desktop: tema (claro/escuro) + cor de acento.
// O desktop sobe { theme, accent } pra user_preferences; aqui a gente aplica.
//
// Dia/noite, porém, é um AJUSTE DO APARELHO: o usuário pode preferir claro no
// celular mesmo com o desktop no escuro (luz ambiente muda). Por isso o tema
// tem um override local (localStorage) que tem prioridade sobre o do documento;
// a cor de acento continua seguindo a personalização do desktop.
import { supabase } from "./supabase";

// Mesmos acentos do desktop (HSL do primaryDark) — ver src/lib/theme.ts.
const ACCENT_HSL: Record<string, string> = {
  violet: "263 80% 68%",
  blue: "213 90% 66%",
  emerald: "158 68% 50%",
  rose: "345 82% 66%",
  amber: "38 92% 56%",
  cyan: "188 82% 52%",
  // Bordô = vinho profundo. O 52% de luz lia como ROSA num fundo neutro do
  // celular; puxei pro tom do swatch do PC (mais escuro/saturado) p/ virar bordô.
  bordo: "345 60% 40%",
};

const LS_THEME = "vistage.mobile.theme"; // override manual de dia/noite no aparelho

type Theme = "light" | "dark";

// Estado aplicado (lembra o acento atual pra o toggle não precisar reconsultar).
const applied: { theme: Theme; accent: string } = { theme: "dark", accent: "violet" };

export function applyTheme(theme: string, accent: string) {
  const t: Theme = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.classList.toggle("light", t === "light");
  const hsl = ACCENT_HSL[accent] ?? ACCENT_HSL.violet;
  root.style.setProperty("--accent", `hsl(${hsl})`);
  applied.theme = t;
  applied.accent = accent;
}

/** Override manual de dia/noite salvo neste aparelho (ou null se não houver). */
function storedTheme(): Theme | null {
  const v = localStorage.getItem(LS_THEME);
  return v === "light" || v === "dark" ? v : null;
}

/** Tema em vigor agora (pro ícone sol/lua na barra). */
export function currentTheme(): Theme {
  return applied.theme;
}

/** Alterna dia/noite, persiste no aparelho e aplica na hora. Retorna o novo. */
export function toggleTheme(): Theme {
  const next: Theme = applied.theme === "light" ? "dark" : "light";
  localStorage.setItem(LS_THEME, next);
  applyTheme(next, applied.accent);
  return next;
}

/**
 * Busca a preferência da conta no Supabase e aplica. O acento segue o desktop;
 * o tema usa o override local do aparelho quando existir (default: escuro).
 * Retorna o tema aplicado pra UI sincronizar o ícone.
 */
export async function loadAndApplyPrefs(): Promise<Theme> {
  let accent = "violet";
  let docTheme: Theme = "dark";
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select("theme, accent")
      .maybeSingle();
    accent = data?.accent ?? "violet";
    docTheme = data?.theme === "light" ? "light" : "dark";
  } catch {
    /* offline → defaults */
  }
  const theme = storedTheme() ?? docTheme;
  applyTheme(theme, accent);
  return theme;
}
