import { supabase } from "./supabase";
import { sendCapture } from "./capture";

export type HeaderInfo = {
  artistName: string | null;
  isotype: string | null; // data URL (base64) ou null
  streak: number;
};

/** Identidade + streak que o desktop sobe pra user_preferences (header do app). */
export async function loadHeaderInfo(): Promise<HeaderInfo> {
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select("artist_name, isotype, focus_streak")
      .maybeSingle();
    return {
      artistName: (data?.artist_name as string | null) ?? null,
      isotype: (data?.isotype as string | null) ?? null,
      streak: (data?.focus_streak as number | null) ?? 0,
    };
  } catch {
    return { artistName: null, isotype: null, streak: 0 };
  }
}

/** Só o streak (leve — sem puxar o isótipo base64). */
export async function loadStreak(): Promise<number> {
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select("focus_streak")
      .maybeSingle();
    return (data?.focus_streak as number | null) ?? 0;
  } catch {
    return 0;
  }
}

/** Total de GIGs (conta o catálogo espelhado). */
export async function loadTotalGigs(): Promise<number> {
  try {
    const { count } = await supabase
      .from("catalog_mirror")
      .select("source_id", { count: "exact", head: true })
      .eq("kind", "gig");
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Edita o nome artístico — vai como captura "identity" pro PC revisar/aplicar. */
export async function updateArtistName(name: string): Promise<void> {
  await sendCapture("identity", { artist_name: name.trim() });
}
