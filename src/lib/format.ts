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

/**
 * Formata um valor numa moeda qualquer (padrão BRL). Usa Intl com o código da
 * moeda; se o código for inválido/desconhecido, cai num formato genérico em vez
 * de quebrar.
 */
export function formatMoney(
  n: number | null | undefined,
  currency = "BRL"
): string {
  if (typeof n !== "number") return "—";
  try {
    return n.toLocaleString("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatCurrency(n: number | null | undefined): string {
  return formatMoney(n, "BRL");
}

export function formatRating(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toFixed(1).replace(".", ",");
}

/**
 * Telefone BR para exibição: (00) 90000-0000 (celular) ou (00) 0000-0000 (fixo).
 * Só reformata quando a entrada é "basicamente um número" (dígitos + ()/-/espaço)
 * — assim uma anotação livre ("ligar no comercial") é devolvida intacta. Entradas
 * com 10/11 dígitos são mascaradas; outras quantidades voltam como vieram.
 */
export function formatPhoneBR(raw: string | null | undefined): string {
  if (!raw) return "";
  if (!/^[\d()\s+-]+$/.test(raw.trim())) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

/** YYYY-MM-DD no fuso LOCAL (não UTC). Sem argumento, retorna hoje. */
export function toLocalISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM no fuso LOCAL. */
export function toLocalYearMonth(d: Date = new Date()): string {
  return toLocalISODate(d).slice(0, 7);
}

/**
 * Hoje em YYYY-MM-DD no fuso LOCAL.
 *
 * NÃO usar `toISOString()` (é sempre UTC): no Brasil (UTC-3), das 21h à
 * meia-noite o "hoje" em UTC já é o dia seguinte, fazendo filtros de
 * "hoje"/"este mês" e due_dates pularem um dia.
 */
export function todayISO(): string {
  return toLocalISODate();
}
