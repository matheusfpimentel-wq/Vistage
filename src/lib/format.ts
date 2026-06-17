import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatDate(iso: string | null | undefined, pattern = "dd MMM yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), pattern, { locale: ptBR });
  } catch {
    return iso;
  }
}

export function formatCurrency(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function formatRating(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toFixed(1).replace(".", ",");
}

/** YYYY-MM-DD no fuso LOCAL (não UTC). Sem argumento, retorna hoje. */
export function toLocalISODate(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

/** YYYY-MM no fuso LOCAL. */
export function toLocalYearMonth(d: Date = new Date()): string {
  return format(d, "yyyy-MM");
}

/**
 * Hoje em YYYY-MM-DD no fuso LOCAL.
 *
 * Importante: NÃO usar `toISOString()` que é sempre UTC — no Brasil (UTC-3),
 * entre 21h e meia-noite o "hoje" em UTC já é o dia seguinte, o que fazia os
 * filtros de "hoje"/"esta semana" e os due_dates pularem um dia à noite.
 */
export function todayISO(): string {
  return toLocalISODate();
}
