import { loadIdentity } from "@/modules/identity/api";
import { formatCurrency } from "@/lib/format";
import type { ClassPackage } from "./types";

const hoursLabel = (h: number | null | undefined): string =>
  h != null ? `${String(h).replace(".", ",")}h` : "";

/**
 * Exporta a ementa detalhada de um pacote-template em PDF, com layout limpo
 * de documento (título, carga horária, descrição e itens da ementa). Usa o
 * mesmo motor jsPDF do relatório mensal.
 */
export async function exportSyllabusPdf(pkg: ClassPackage): Promise<void> {
  let artistName = "";
  try {
    const identity = await loadIdentity();
    artistName = identity.artist_name ?? "";
  } catch {
    // identidade é opcional no cabeçalho
  }

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

  // Cabeçalho: nome do artista/escola (se houver)
  if (artistName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(artistName.toUpperCase(), marginX, y);
    y += 18;
  }

  // Título da ementa
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20);
  const titleLines = doc.splitTextToSize(pkg.name, contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 24;

  // Subtítulo: carga horária + nº de aulas + preço
  const subParts: string[] = [];
  if (pkg.total_hours != null) subParts.push(`${hoursLabel(pkg.total_hours)} de carga horária`);
  if (pkg.total_classes) subParts.push(`${pkg.total_classes} aula(s)`);
  if (pkg.price != null) subParts.push(formatCurrency(pkg.price));
  if (subParts.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(subParts.join("  ·  "), marginX, y);
    y += 16;
  }

  doc.setDrawColor(200);
  doc.line(marginX, y, contentRight, y);
  y += 24;

  // Descrição geral
  if (pkg.description && pkg.description.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text("Apresentação", marginX, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60);
    const descLines = doc.splitTextToSize(pkg.description.trim(), contentWidth);
    for (const line of descLines as string[]) {
      checkPage(16);
      doc.text(line, marginX, y);
      y += 15;
    }
    y += 14;
  }

  // Ementa detalhada
  if (pkg.syllabus_items.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30);
    checkPage(24);
    doc.text("Ementa detalhada", marginX, y);
    y += 20;

    pkg.syllabus_items.forEach((item, idx) => {
      checkPage(28);
      // Título do módulo + carga horária
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20);
      const head = `${idx + 1}. ${item.title || "(sem título)"}`;
      const headLines = doc.splitTextToSize(head, contentWidth - 70) as string[];
      doc.text(headLines, marginX, y);
      if (item.hours != null) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(110);
        doc.text(hoursLabel(item.hours), contentRight, y, { align: "right" });
      }
      y += headLines.length * 15;

      // Detalhe do módulo
      if (item.detail && item.detail.trim()) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(80);
        const detailLines = doc.splitTextToSize(item.detail.trim(), contentWidth - 16) as string[];
        for (const line of detailLines) {
          checkPage(14);
          doc.text(line, marginX + 12, y);
          y += 13;
        }
      }
      y += 10;
    });
  }

  const safeName = pkg.name.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "ementa";
  doc.save(`ementa-${safeName}.pdf`);
}
