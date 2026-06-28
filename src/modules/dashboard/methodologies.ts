import { readDocValue, writeDocValue } from "@/lib/docSettings";

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

/**
 * Carrega os itens manuais do SWOT salvos pelo usuário. Conteúdo do DOCUMENTO
 * (viaja no .vistage); migra automaticamente do local antigo (app_settings) na
 * 1ª leitura.
 */
export async function loadSwot(): Promise<SwotData> {
  try {
    const raw = await readDocValue(SWOT_SETTING_KEY, SWOT_SETTING_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SwotData>;
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

/** Salva os itens manuais do SWOT (marca o documento como não salvo). */
export async function saveSwot(data: SwotData): Promise<void> {
  await writeDocValue(SWOT_SETTING_KEY, JSON.stringify(data));
}

/**
 * Carrega o conjunto de oportunidades (derivadas de debriefs) que o usuário
 * dispensou. Cada item é identificado pelo seu texto.
 */
export async function loadDismissedOpportunities(): Promise<string[]> {
  try {
    const raw = await readDocValue(DISMISSED_OPP_KEY, DISMISSED_OPP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Salva o conjunto de oportunidades dispensadas (marca o documento como não salvo). */
export async function saveDismissedOpportunities(items: string[]): Promise<void> {
  await writeDocValue(DISMISSED_OPP_KEY, JSON.stringify(items));
}
