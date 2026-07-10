import { loadIdentity } from "@/modules/identity/api";
import { formatCurrency } from "@/lib/format";
import { savePdfDoc } from "@/lib/savePdf";
import {
  createPdf,
  pdfHeader,
  pdfSection,
  pdfFooter,
  accentRgb,
  PDF_MARGIN,
  PDF_BOTTOM,
  FAINT,
} from "@/lib/pdfKit";
import type { ClassPackage } from "./types";

const hoursLabel = (h: number | null | undefined): string => {
  if (h == null) return "";
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm}min`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}min`;
};

/**
 * Exporta a ementa detalhada de um pacote-template em PDF com o chrome do
 * pdfKit (texto sanitizado, separadores desenhados) e salvamento pelo diálogo
 * nativo — o doc.save() do jsPDF cai no vazio na webview do Tauri.
 */
export async function exportSyllabusPdf(pkg: ClassPackage): Promise<void> {
  let artistName = "";
  try {
    const identity = await loadIdentity();
    artistName = identity.artist_name ?? "";
  } catch {
    // identidade é opcional no cabeçalho
  }

  const doc = await createPdf();
  const pageHeight = doc.internal.pageSize.getHeight();
  const mx = PDF_MARGIN;
  const contentRight = doc.internal.pageSize.getWidth() - mx;
  const contentWidth = contentRight - mx;
  const accent = accentRgb();

  // Subtítulo: carga horária + nº de aulas + preço (pontinhos desenhados)
  const subParts: string[] = [];
  if (pkg.total_hours != null) subParts.push(`${hoursLabel(pkg.total_hours)} de carga horária`);
  if (pkg.total_classes) subParts.push(`${pkg.total_classes} aula(s)`);
  if (pkg.price != null) subParts.push(formatCurrency(pkg.price));

  let y = pdfHeader(doc, {
    kicker: artistName || "Ementa",
    title: pkg.name,
    meta: subParts,
    accent,
  });

  function checkPage(needed = 24) {
    if (y + needed > pageHeight - PDF_BOTTOM) {
      doc.addPage();
      y = 64;
    }
  }

  // Descrição geral
  if (pkg.description && pkg.description.trim()) {
    checkPage(36);
    y = pdfSection(doc, y, "Apresentação", accent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(55, 65, 81);
    const descLines = doc.splitTextToSize(pkg.description.trim(), contentWidth) as string[];
    for (const line of descLines) {
      checkPage(16);
      doc.text(line, mx, y);
      y += 15;
    }
    y += 14;
  }

  // Ementa detalhada
  if (pkg.syllabus_items.length > 0) {
    checkPage(36);
    y = pdfSection(doc, y, "Ementa detalhada", accent);
    pkg.syllabus_items.forEach((item, idx) => {
      checkPage(28);
      // Título do módulo + carga horária
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(17, 24, 39);
      const head = `${idx + 1}. ${item.title || "(sem título)"}`;
      const headLines = doc.splitTextToSize(head, contentWidth - 70) as string[];
      doc.text(headLines, mx, y);
      if (item.hours != null) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...FAINT);
        doc.text(hoursLabel(item.hours), contentRight, y, { align: "right" });
      }
      y += headLines.length * 15;

      // Detalhe do módulo
      if (item.detail && item.detail.trim()) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        const detailLines = doc.splitTextToSize(item.detail.trim(), contentWidth - 16) as string[];
        for (const line of detailLines) {
          checkPage(14);
          doc.text(line, mx + 12, y);
          y += 13;
        }
      }
      y += 10;
    });
  }

  pdfFooter(doc, artistName || "Vistage");

  const safeName = pkg.name.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "ementa";
  await savePdfDoc(doc, `ementa-${safeName}`);
}
