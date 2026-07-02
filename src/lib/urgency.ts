/**
 * Fonte única dos gatilhos de urgência. Toda coloração de prazo/data no app
 * consome `urgencyLevel` — nada de recalcular "≤48h" espalhado, senão os
 * arquivos divergem de novo.
 *
 * Escala de 3 níveis (não 4): a pessoa age quando está PERTO ou quando
 * ESTOUROU; distinguir "faltam 6 dias" de "faltam 8" é ruído. `ok` é neutro
 * (sem cor) — a maioria cai aqui, e colorir tudo mata o sinal.
 *
 * Apresentação (cor + ícone, nunca só cor — WCAG 1.4.1) fica em
 * `@/components/ui/urgency-mark`; aqui só a lógica pura e os helpers de classe.
 */
export type UrgencyKind = "event" | "deadline";
export type UrgencyLevel = "overdue" | "soon" | "ok";

const SOON_HOURS: Record<UrgencyKind, number> = {
  event: 7 * 24, // algo que ACONTECE nessa data: GIG, festa
  deadline: 48, // algo que VENCE nessa data: tarefa, OKR, ação de mkt, confirmação, prazo de faixa
};

/**
 * Instante efetivo da data. Strings só-data ("YYYY-MM-DD") viram o FIM do dia
 * LOCAL: algo que vence/acontece HOJE não é atraso durante o dia, e evita o
 * parse UTC que joga a data pro dia anterior (fuso BRT). Datas com hora vão como
 * estão.
 */
function instant(date: string | Date): Date {
  if (date instanceof Date) return date;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T23:59:59`) : new Date(date);
}

export function urgencyLevel(
  date: string | Date | null | undefined,
  kind: UrgencyKind,
  now: Date = new Date(),
): UrgencyLevel | null {
  if (!date) return null; // sem data → sem indicador
  const d = instant(date);
  if (isNaN(d.getTime())) return null;
  const diffH = (d.getTime() - now.getTime()) / 36e5;
  if (diffH < 0) return "overdue";
  if (diffH <= SOON_HOURS[kind]) return "soon";
  return "ok";
}

/** Só a cor de texto. Prefira `<UrgencyMark>` para vir com o ícone junto. */
export function urgencyTextClass(level: UrgencyLevel | null | undefined): string {
  return level === "overdue"
    ? "text-urgent-overdue"
    : level === "soon"
    ? "text-urgent-soon"
    : "";
}

/** Borda + texto — para inputs de data com urgência (o valor visível dá o 2º canal). */
export function urgencyClass(level: UrgencyLevel | null | undefined): string {
  return level === "overdue"
    ? "border-urgent-overdue text-urgent-overdue"
    : level === "soon"
    ? "border-urgent-soon text-urgent-soon"
    : "";
}
