// Aparência espelhada do desktop: tema (claro/escuro) + cor de acento.
// O desktop sobe { theme, accent } pra user_preferences; aqui a gente aplica.
import { supabase } from "./supabase";

// Mesmos acentos do desktop (HSL do primaryDark) — ver src/lib/theme.ts.
const ACCENT_HSL: Record<string, string> = {
  violet: "263 80% 68%",
  blue: "213 90% 66%",
  emerald: "158 68% 50%",
  rose: "345 82% 66%",
  amber: "38 92% 56%",
  cyan: "188 82% 52%",
};

export function applyTheme(theme: string, accent: string) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  const hsl = ACCENT_HSL[accent] ?? ACCENT_HSL.violet;
  root.style.setProperty("--accent", `hsl(${hsl})`);
}

/** Busca a preferência da conta no Supabase e aplica (default escuro/violeta). */
export async function loadAndApplyPrefs(): Promise<void> {
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select("theme, accent")
      .maybeSingle();
    applyTheme(data?.theme === "light" ? "light" : "dark", data?.accent ?? "violet");
  } catch {
    applyTheme("dark", "violet");
  }
}
