/**
 * Itens acionáveis do debrief (Fortes / Fracos / Oportunidades futuras).
 *
 * Armazenamento sem migração: reaproveita as colunas de texto existentes
 * (debrief_strengths / debrief_weaknesses / debrief_future_opportunities).
 * Quando há itens estruturados, a coluna guarda um JSON array; textos legados
 * (linhas separadas por \n) são convertidos em itens de 1 linha na leitura, sem
 * perda. Cada item pode carregar o vínculo com a tarefa/ideia/pessoa criada.
 */
export type DebriefItem = {
  text: string;
  /** id da tarefa criada a partir deste item ("virar tarefa"). */
  taskId?: number;
  /** id da ideia criada a partir deste item ("virar ideia"). */
  ideaId?: number;
  /** Pessoa vinculada (oportunidades futuras). */
  contactId?: number;
  contactName?: string;
};

function normalize(raw: unknown): DebriefItem | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { text } : null;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) return null;
    const item: DebriefItem = { text };
    if (typeof o.taskId === "number") item.taskId = o.taskId;
    if (typeof o.ideaId === "number") item.ideaId = o.ideaId;
    if (typeof o.contactId === "number") item.contactId = o.contactId;
    if (typeof o.contactName === "string") item.contactName = o.contactName;
    return item;
  }
  return null;
}

/** Lê itens de uma coluna: JSON array de itens ou texto legado (1 item/linha). */
export function parseDebriefItems(raw: string | null | undefined): DebriefItem[] {
  if (!raw) return [];
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) {
        const items = arr.map(normalize).filter((x): x is DebriefItem => x !== null);
        // Só aceita o parse JSON se ele de fato rendeu itens. Um texto legado que
        // por acaso é um array JSON sem itens válidos (ex.: "[1, 2, 3]") NÃO pode
        // ser silenciosamente descartado — cai no fallback de texto abaixo.
        if (items.length > 0) return items;
      }
    } catch {
      /* cai no fallback de texto legado */
    }
  }
  // Texto legado: cada linha vira um item.
  return t
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

/** Serializa itens para a coluna (JSON array), ou null se vazio. */
export function serializeDebriefItems(items: DebriefItem[]): string | null {
  const clean = items.filter((i) => i.text.trim().length > 0);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}
