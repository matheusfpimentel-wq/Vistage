/**
 * Atalhos de ação rápida (§8): toque-pra-ligar, WhatsApp e Maps. Centraliza a
 * limpeza do telefone e a montagem dos links pra todas as telas usarem igual.
 */

/** Só os dígitos do telefone (pro tel:/wa.me). Vazio → null. */
export function digits(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

/**
 * Número no formato E.164 (só dígitos, com código de país) pro wa.me. O app é
 * BR: um número nacional (10–11 dígitos: DDD + linha) ganha o "55" na frente; se
 * já vier com o país (12–13 dígitos começando com 55), fica como está. Número
 * com "+" é internacional explícito (vale o que veio — nunca ganha 55). O zero
 * de tronco ("0" + DDD) é descartado antes de completar. Fora desses casos,
 * melhor esforço com os dígitos como vieram.
 */
export function e164(phone: unknown, country = "55"): string | null {
  let d = digits(phone);
  if (!d) return null;
  // "+" = país explícito: prefixar 55 num +1 415… mandaria pro número errado.
  if (typeof phone === "string" && phone.trim().startsWith("+")) return d;
  // Zero de tronco nacional (0 + DDD + linha): cai fora antes de completar.
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.startsWith(country) && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return country + d;
  return d;
}

/** Link de ligação direta (tel:). */
export function telLink(phone: unknown): string | null {
  const d = digits(phone);
  return d ? `tel:${d}` : null;
}

/** Link de WhatsApp (wa.me) com número normalizado em E.164. */
export function waLink(phone: unknown): string | null {
  const d = e164(phone);
  return d ? `https://wa.me/${d}` : null;
}

/** Link de mapa por TEXTO (venue + cidade) — não precisa de endereço exato. */
export function mapsLink(...parts: (string | null | undefined)[]): string | null {
  const q = parts.filter((p) => typeof p === "string" && p.trim()).join(", ").trim();
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : null;
}
