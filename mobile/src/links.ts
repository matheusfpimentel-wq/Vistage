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

/** Link de ligação direta (tel:). */
export function telLink(phone: unknown): string | null {
  const d = digits(phone);
  return d ? `tel:${d}` : null;
}

/** Link de WhatsApp (wa.me). */
export function waLink(phone: unknown): string | null {
  const d = digits(phone);
  return d ? `https://wa.me/${d}` : null;
}

/** Link de mapa por TEXTO (venue + cidade) — não precisa de endereço exato. */
export function mapsLink(...parts: (string | null | undefined)[]): string | null {
  const q = parts.filter((p) => typeof p === "string" && p.trim()).join(", ").trim();
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : null;
}
