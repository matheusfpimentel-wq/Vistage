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
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const contentRight = pageWidth - marginX;
  const contentWidth = contentRight - marginX;
  let y = 64;

  function checkPage(needed = 24) {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 64;
    }
  }

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20);
  const title = `Rider técnico — ${partyTitle || "Festa"}`;
  const titleLines = doc.splitTextToSize(title, contentWidth) as string[];
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 24;

  // Régua de destaque
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(2);
  doc.line(marginX, y - 6, contentRight, y - 6);
  doc.setLineWidth(1);
  y += 14;

  if (partyDate) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(formatDate(partyDate), marginX, y);
    y += 18;
  }

  for (const { category, rows } of groupByCategory(items)) {
    checkPage(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text(category, marginX, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60);
    for (const r of rows) {
      const qty = r.quantity && r.quantity > 1 ? `${r.quantity}× ` : "";
      const by = r.by ? `  (${r.by})` : "";
      const text = `•  ${qty}${r.item}${by}`;
      const wrapped = doc.splitTextToSize(text, contentWidth - 12) as string[];
      for (const line of wrapped) {
        checkPage(14);
        doc.text(line, marginX + 12, y);
        y += 14;
      }
    }
    y += 10;
  }

  const safe = (partyTitle || "festa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "festa";
  doc.save(`rider-${safe}.pdf`);
}
