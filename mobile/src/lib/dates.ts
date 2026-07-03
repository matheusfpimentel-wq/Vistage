// Datas no mobile: parse SEMPRE local.
//
// O bug clássico é `new Date("2026-07-03")`: sem hora, o JS interpreta como
// meia-noite UTC. Em fusos negativos (ex.: America/Sao_Paulo, −03) isso "volta"
// um dia — a data só-data cai no dia anterior. Aqui, uma string só-data (sem
// "T") vira meia-noite LOCAL antes de virar Date; strings com hora/offset são
// respeitadas como vieram.

/** Date a partir de um ISO, tratando string só-data como meia-noite local. */
export function parseLocal(iso: string): Date {
  return new Date(iso.includes("T") ? iso : iso + "T00:00:00");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD local de um Date. */
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hoje em YYYY-MM-DD (local). */
export function localToday(): string {
  return localISO(new Date());
}

/** YYYY-MM-DD local de um ISO qualquer (null-safe). */
export function localDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return localISO(parseLocal(iso));
}

/** HH:MM local, ou null quando é meia-noite ("dia inteiro"). */
export function timeOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = parseLocal(iso);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "03 jul" a partir de uma data só-data ou datetime (local; null-safe). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return parseLocal(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
