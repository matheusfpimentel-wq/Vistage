import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Valor exibido quando uma célula/campo está vazio. Decisão do dono: célula
 * vazia fica EM BRANCO — sem "—" nem outro caractere de preenchimento.
 * Fonte única pra padronizar as listas.
 */
export const EMPTY_VALUE = "";

export function formatDate(iso: string | null | undefined, pattern = "dd MMM yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), pattern, { locale: ptBR });
  } catch {
    return iso;
  }
}

/**
 * YYYY-MM-DD (ou ISO completo) → DD/MM/YYYY. Sem fuso — é só rearranjo de string,
 * então não sofre o off-by-one de UTC. Vazio/nulo → "". Fonte única: antes havia
 * cópias locais em finance/api.ts (fmtDateBR) e meetings/ataPrint.ts.
 */
export function formatDateBR(date: string | null | undefined): string {
  if (!date) return "";
  const [y, m, d] = date.slice(0, 10).split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
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

/** Só os dígitos do telefone (pro tel:/wa.me). Curto demais (< 8) → null. */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

/**
 * Telefone em E.164 (só dígitos, com país) pro wa.me. App BR: número nacional
 * (10–11 dígitos) ganha "55"; já com país (12–13, começando com 55) fica; número
 * com "+" é internacional explícito (nunca ganha 55); o zero de tronco é
 * descartado. Portado do mobile (mobile/src/links.ts) pra o desktop reusar.
 */
export function phoneE164(phone: string | null | undefined, country = "55"): string | null {
  let d = phoneDigits(phone);
  if (!d) return null;
  if (typeof phone === "string" && phone.trim().startsWith("+")) return d;
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.startsWith(country) && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return country + d;
  return d;
}

/** Link de WhatsApp (wa.me) com número normalizado em E.164, ou null. */
export function waLink(phone: string | null | undefined): string | null {
  const d = phoneE164(phone);
  return d ? `https://wa.me/${d}` : null;
}

/** Link de ligação direta (tel:), ou null. */
export function telLink(phone: string | null | undefined): string | null {
  const d = phoneDigits(phone);
  return d ? `tel:${d}` : null;
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
