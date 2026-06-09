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

/** Hoje em YYYY-MM-DD (timezone local). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
