import type { jsPDF } from "jspdf";
import { ACCENTS, useThemeStore } from "./theme";

// ── Kit visual dos PDFs (jsPDF) ───────────────────────────────────────────────
// Por que existe: as fontes padrão do jsPDF (Helvetica etc.) saem SEM embutir no
// arquivo — o visualizador substitui por uma parecida. Substitutas pobres
// (celular, leitores leves) não têm glifo pra pontuação tipográfica (· • – — ↳)
// e mostram um QUADRADO (tofu). Regra do kit:
//   1. texto só carrega ASCII + letras acentuadas Latin-1 (qualquer substituta tem);
//   2. separadores/bolinhas/setas são DESENHADOS como vetor — nunca dependem de fonte;
//   3. todos os geradores usam o mesmo chrome (fita da cor de destaque, cabeçalho,
//      rodapé com página) pra sair com cara de documento da mesma casa.

export const PDF_MARGIN = 48;
/** Reserva inferior (rodapé do kit). Use nos checks de quebra de página. */
export const PDF_BOTTOM = 64;

export type Rgb = [number, number, number];
export const INK: Rgb = [17, 24, 39]; // gray-900
export const SOFT: Rgb = [107, 114, 128]; // gray-500
export const FAINT: Rgb = [156, 163, 175]; // gray-400
export const HAIR: Rgb = [229, 231, 235]; // gray-200

// ── Cores ─────────────────────────────────────────────────────────────────────
function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** "H S% L%" ou "hsl(H S% L%)" → RGB (null se não parsear). */
export function parseHsl(str: string): Rgb | null {
  const m = /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/.exec(str);
  if (!m) return null;
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** "#rrggbb" (ou #rgb) → RGB (null se não parsear). */
export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Cor de destaque atual do app (variante clara — PDF é papel branco). */
export function accentRgb(): Rgb {
  const { accent } = useThemeStore.getState();
  const def = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];
  return parseHsl(def.primaryLight) ?? [124, 58, 237];
}

// ── Texto seguro ──────────────────────────────────────────────────────────────
// Tipográficos → ASCII. O resto fora de ASCII/Latin-1 (emoji, setas, caixas) some.
const CHAR_MAP: Record<string, string> = {
  "·": "-", // · (o próprio vilão — onde o design pedir ponto, desenhamos)
  "•": "-", "∙": "-", "⋅": "-", "●": "-", "▪": "-",
  "‣": "-", "◦": "-", "⁃": "-",
  "–": "-", "—": "-", "−": "-", "―": "-",
  "‘": "'", "’": "'", "‚": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "″": '"',
  "…": "...",
  "↳": ">", "→": ">", "←": "<", "➜": ">", "➔": ">",
  "✓": "v", "✗": "x",
  " ": " ",
};

/** Sanitiza uma string pra fonte padrão do PDF nunca mostrar quadrado. */
export function pdfSafe(input: string): string {
  let out = "";
  for (const ch of String(input).normalize("NFC")) {
    const mapped = CHAR_MAP[ch];
    if (mapped != null) {
      out += mapped;
      continue;
    }
    const o = ch.codePointAt(0)!;
    if ((o >= 0x20 && o <= 0x7e) || (o >= 0xa1 && o <= 0xff)) {
      out += ch;
      continue;
    }
    // emoji, símbolos, controles CP1252 (0x80-0x9F): descarta
  }
  // colapsa espaços duplicados que sobram das remoções ("A 🎵 B" → "A B")
  return out.replace(/ {2,}/g, " ");
}

/**
 * Cria o documento A4 com `text`/`splitTextToSize` já SANITIZANDO tudo — assim
 * até dados do usuário (título de faixa com emoji…) saem limpos sem esforço.
 */
export async function createPdf(): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  type TextFn = (t: string | string[], ...rest: unknown[]) => jsPDF;
  type SplitFn = (t: string, ...rest: unknown[]) => string[];
  const rawText = (doc.text as unknown as TextFn).bind(doc);
  const rawSplit = (doc.splitTextToSize as unknown as SplitFn).bind(doc);
  (doc as unknown as { text: TextFn }).text = (t, ...rest) =>
    rawText(Array.isArray(t) ? t.map((s) => pdfSafe(s)) : pdfSafe(t), ...rest);
  (doc as unknown as { splitTextToSize: SplitFn }).splitTextToSize = (t, ...rest) =>
    rawSplit(pdfSafe(t), ...rest);
  return doc;
}

// ── Vetores no lugar de glifos ────────────────────────────────────────────────
/** Pontinho vetorial (o "·" que nunca vira quadrado). */
export function drawDot(doc: jsPDF, x: number, y: number, color: Rgb = FAINT, r = 1.2): void {
  doc.setFillColor(...color);
  doc.circle(x, y, r, "F");
}

/** Bolota de lista (bullet) vetorial. */
export function drawBullet(doc: jsPDF, x: number, y: number, color: Rgb): void {
  doc.setFillColor(...color);
  doc.circle(x, y - 3.2, 1.7, "F");
}

/** Setinha de transição (o antigo "↳"), desenhada. */
export function drawElbow(doc: jsPDF, x: number, y: number, color: Rgb = FAINT): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  doc.line(x, y - 8, x, y - 2.6);
  doc.line(x, y - 2.6, x + 6, y - 2.6);
  doc.line(x + 6, y - 2.6, x + 3.8, y - 4.6);
  doc.line(x + 6, y - 2.6, x + 3.8, y - 0.6);
}

/**
 * Escreve partes de texto separadas por pontinhos DESENHADOS ("a · b · c").
 * Usa a fonte/tamanho/cor atuais do doc. Devolve o x final.
 */
export function dotJoin(doc: jsPDF, parts: string[], x: number, y: number, dotColor: Rgb = FAINT): number {
  const clean = parts.map((p) => pdfSafe(p)).filter((p) => p.trim().length > 0);
  let cx = x;
  const size = doc.getFontSize();
  clean.forEach((p, i) => {
    if (i > 0) {
      drawDot(doc, cx + 6, y - size * 0.3, dotColor);
      cx += 12;
    }
    doc.text(p, cx, y);
    cx += doc.getTextWidth(p);
  });
  return cx;
}

/** Corta com "..." pra caber em maxW (na fonte/tamanho atuais). */
export function truncateToWidth(doc: jsPDF, text: string, maxW: number): string {
  let t = pdfSafe(text);
  if (doc.getTextWidth(t) <= maxW) return t;
  while (t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);
  return t + "...";
}

/**
 * Linha "principal · secundário" (ex.: título da faixa + artista) com ponto
 * desenhado, truncando o que estourar maxW. Mantém tamanho atual da fonte.
 */
export function textDuo(
  doc: jsPDF,
  x: number,
  y: number,
  maxW: number,
  primary: string,
  secondary: string | null | undefined
): void {
  const size = doc.getFontSize();
  const p = truncateToWidth(doc, primary, maxW);
  doc.setTextColor(...INK);
  doc.text(p, x, y);
  const pw = doc.getTextWidth(p);
  const rest = maxW - pw - 12;
  if (secondary && secondary.trim() && rest > 24) {
    drawDot(doc, x + pw + 6, y - size * 0.3, FAINT);
    doc.setTextColor(...SOFT);
    doc.text(truncateToWidth(doc, secondary, rest), x + pw + 12, y);
  }
}

// ── Chrome (cabeçalho / seção / rodapé) ──────────────────────────────────────
export type PdfHeaderOpts = {
  /** Rótulo pequeno acima do título (ex.: "SET PLANNER"). */
  kicker?: string;
  title: string;
  /** Partes do subtítulo, unidas por pontinhos desenhados. */
  meta?: (string | null | undefined)[];
  accent?: Rgb;
};

/** Fita de cor no topo + kicker + título + meta. Devolve o y inicial do conteúdo. */
export function pdfHeader(doc: jsPDF, opts: PdfHeaderOpts): number {
  const W = doc.internal.pageSize.getWidth();
  const mx = PDF_MARGIN;
  const accent = opts.accent ?? accentRgb();

  doc.setFillColor(...accent);
  doc.rect(0, 0, W, 6, "F");

  let y = 64;
  if (opts.kicker && opts.kicker.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(pdfSafe(opts.kicker).toUpperCase(), mx, y, { charSpace: 1.4 });
    y += 17;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(opts.title, W - mx * 2) as string[];
  doc.text(lines, mx, y);
  y += lines.length * 24;

  const meta = (opts.meta ?? []).filter((m): m is string => !!m && m.trim().length > 0);
  if (meta.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...SOFT);
    dotJoin(doc, meta, mx, y, accent);
    y += 16;
  }

  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.75);
  doc.line(mx, y, W - mx, y);
  return y + 22;
}

/** Cabeçalho de seção: quadradinho colorido + rótulo em caixa alta (+ texto à direita). */
export function pdfSection(doc: jsPDF, y: number, label: string, color?: Rgb, rightText?: string): number {
  const W = doc.internal.pageSize.getWidth();
  const mx = PDF_MARGIN;
  const c = color ?? accentRgb();
  doc.setFillColor(...c);
  doc.roundedRect(mx, y - 7, 7, 7, 1.6, 1.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  doc.text(pdfSafe(label).toUpperCase(), mx + 13, y, { charSpace: 0.6 });
  if (rightText && rightText.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...FAINT);
    doc.text(rightText, W - mx, y, { align: "right" });
  }
  return y + 17;
}

/** Rodapé em todas as páginas: hairline + assinatura + "Página X de Y". */
export function pdfFooter(doc: jsPDF, label = "Vistage"): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = PDF_MARGIN;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.75);
    doc.line(mx, H - 42, W - mx, H - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...FAINT);
    doc.text(pdfSafe(label), mx, H - 29);
    doc.text(`Página ${i} de ${total}`, W - mx, H - 29, { align: "right" });
  }
}
