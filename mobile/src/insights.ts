import { supabase } from "./supabase";

/**
 * Provocações/insights vindos do PC (provocations_mirror) — pra coincidir com o
 * que aparece no computador. Se a tabela estiver vazia (ou o desktop ainda não
 * sincronizou com a versão nova), cai no fallback embutido.
 */
export async function loadProvocations(fallback: string[]): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("provocations_mirror")
      .select("text")
      .limit(300);
    const list = (data ?? [])
      .map((r) => (r as { text: string | null }).text)
      .filter((t): t is string => !!t && t.trim().length > 0);
    return list.length ? list : fallback;
  } catch {
    return fallback;
  }
}
