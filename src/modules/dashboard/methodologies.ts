import { getDb } from "@/lib/db";

export type SwotKey = "strengths" | "weaknesses" | "opportunities" | "threats";

export type SwotData = Record<SwotKey, string[]>;

const SWOT_SETTING_KEY = "swot_items";
const DISMISSED_OPP_KEY = "swot_dismissed_opportunities";

const EMPTY: SwotData = {
  strengths: [],
  weaknesses: [],
  opportunities: [],
  threats: [],
};

/** Carrega os itens manuais do SWOT salvos pelo usuário. */
export async function loadSwot(): Promise<SwotData> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [SWOT_SETTING_KEY]
    );
    if (!rows[0]) return { ...EMPTY };
    const parsed = JSON.parse(rows[0].value) as Partial<SwotData>;
    return {
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      opportunities: parsed.opportunities ?? [],
      threats: parsed.threats ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Salva os itens manuais do SWOT. */
export async function saveSwot(data: SwotData): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [SWOT_SETTING_KEY, JSON.stringify(data)]
  );
}

/**
 * Carrega o conjunto de oportunidades (derivadas de debriefs) que o usuário
 * dispensou. Cada item é identificado pelo seu texto.
 */
export async function loadDismissedOpportunities(): Promise<string[]> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [DISMISSED_OPP_KEY]
    );
    if (!rows[0]) return [];
    const parsed = JSON.parse(rows[0].value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Salva o conjunto de oportunidades dispensadas. */
export async function saveDismissedOpportunities(items: string[]): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [DISMISSED_OPP_KEY, JSON.stringify(items)]
  );
}
