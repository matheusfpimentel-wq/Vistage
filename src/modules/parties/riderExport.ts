import type { RiderItem } from "./types";
import { RIDER_CATEGORIES } from "./types";
import { formatDate } from "@/lib/format";

/**
 * Exportação do rider técnico da festa para enviar à casa/técnico:
 * `riderToText` (copiar) e `printRiderPdf` (mesmo padrão jsPDF da Show Sheet).
 * Agrupa por categoria e lista item · quantidade · quem fornece.
 */

function groupByCategory(items: RiderItem[]): { category: string; rows: RiderItem[] }[] {
  const order = [...RIDER_CATEGORIES, "Outros"];
  const map = new Map<string, RiderItem[]>();
  for (const it of items) {
    const cat = it.category || "Outros";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(it);
  }
  const cats = Array.from(map.keys()).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return cats.map((category) => ({ category, rows: map.get(category)! }));
}

export function riderToText(items: RiderItem[], partyTitle: string, partyDate: string | null): string {
  const lines: string[] = [];
  lines.push(`Rider técnico — ${partyTitle || "Festa"}${partyDate ? ` (${formatDate(partyDate)})` : ""}`);
  lines.push("");
  for (const { category, rows } of groupByCategory(items)) {
    lines.push(`${category}:`);
    for (const r of rows) {
      const qty = r.quantity && r.quantity > 1 ? `${r.quantity}× ` : "";
      const by = r.by ? ` — ${r.by}` : "";
      lines.push(`  • ${qty}${r.item}${by}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export async function printRiderPdf(items: RiderItem[], partyTitle: string, partyDate: string | null): Promise<void> {
  const kit = await import("@/lib/pdfKit");
  const { savePdfDoc } = await import("@/lib/savePdf");
  const doc = await kit.createPdf();
  const pageHeight = doc.internal.pageSize.getHeight();
  const mx = kit.PDF_MARGIN;
  const contentWidth = doc.internal.pageSize.getWidth() - mx * 2;
  const accent = kit.accentRgb();

  let y = kit.pdfHeader(doc, {
    kicker: "Rider técnico",
    title: partyTitle || "Festa",
    meta: [partyDate ? formatDate(partyDate) : null],
    accent,
  });

  function checkPage(needed = 24) {
    if (y + needed > pageHeight - kit.PDF_BOTTOM) {
      doc.addPage();
      y = 64;
    }
  }

  for (const { category, rows } of groupByCategory(items)) {
    checkPage(34);
    y = kit.pdfSection(doc, y, category, accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const r of rows) {
      const qty = r.quantity && r.quantity > 1 ? `${r.quantity}x ` : "";
      const by = r.by ? `  (${r.by})` : "";
      const wrapped = doc.splitTextToSize(`${qty}${r.item}${by}`, contentWidth - 14) as string[];
      wrapped.forEach((line, i) => {
        checkPage(14);
        if (i === 0) kit.drawBullet(doc, mx + 3, y, accent);
        doc.setTextColor(55, 65, 81);
        doc.text(line, mx + 14, y);
        y += 14;
      });
    }
    y += 12;
  }

  kit.pdfFooter(doc);
  const safe = (partyTitle || "festa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "festa";
  await savePdfDoc(doc, `rider-${safe}`);
}
