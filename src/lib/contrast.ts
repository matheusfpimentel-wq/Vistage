/**
 * Preto ou branco para o MAIOR contraste sobre uma cor de fundo `hex` (WCAG 2.0
 * relative luminance). Usado onde o usuário escolhe a cor (ex.: cor por coluna do
 * Kanban) e o texto do card precisa continuar legível (AA) nos dois temas.
 */
export function readableTextColor(hex: string): "#000000" | "#ffffff" {
  const c = hex.replace("#", "").trim();
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  if (full.length < 6) return "#000000";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Razão de contraste com branco (#fff) vs preto (#000); escolhe a maior.
  const withWhite = 1.05 / (L + 0.05);
  const withBlack = (L + 0.05) / 0.05;
  return withWhite >= withBlack ? "#ffffff" : "#000000";
}
