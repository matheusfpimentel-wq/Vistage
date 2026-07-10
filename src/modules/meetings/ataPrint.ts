import { toast } from "@/components/ui/toaster";
import { loadIdentity } from "@/modules/identity/api";
import { savePdfDoc } from "@/lib/savePdf";
import { createPdf, pdfHeader, pdfSection, pdfFooter, PDF_MARGIN, PDF_BOTTOM, SOFT, FAINT } from "@/lib/pdfKit";

export type AtaData = {
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  participants: string[];
  /** Ata — texto completo. */
  notes: string | null;
  /** Encaminhamentos / decisões. */
  outcomes: string | null;
};

/** YYYY-MM-DD → DD/MM/YYYY (sem fuso, é só string). */
function formatDateBR(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

/**
 * Gera a ata da reunião em PDF com o chrome do pdfKit (texto sanitizado +
 * separadores desenhados — nada de "quadrado" em visualizador nenhum). Salva
 * pelo diálogo nativo (savePdfDoc): o doc.save() do jsPDF cai no vazio na
 * webview do Tauri.
 */
export async function printAta(data: AtaData): Promise<void> {
  try {
    let artistName = "";
    try {
      const identity = await loadIdentity();
      artistName = identity.artist_name ?? "";
    } catch {
      // identidade é opcional no cabeçalho
    }

    const doc = await createPdf();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const mx = PDF_MARGIN;
    const contentWidth = W - mx * 2;

    const title = data.title || "Reunião";
    let y = pdfHeader(doc, {
      kicker: "Ata de reunião",
      title,
      meta: [formatDateBR(data.date), data.time, data.location],
    });

    const ensure = (need = 24) => {
      if (y + need > H - PDF_BOTTOM) {
        doc.addPage();
        y = 64;
      }
    };

    // Participantes
    if (data.participants.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...SOFT);
      const pLines = doc.splitTextToSize(
        `Participantes: ${data.participants.join(", ")}`,
        contentWidth
      ) as string[];
      for (const line of pLines) {
        ensure(14);
        doc.text(line, mx, y);
        y += 13;
      }
      y += 12;
    }

    // Seções de texto
    const section = (label: string, body: string | null) => {
      ensure(36);
      y = pdfSection(doc, y, label);
      const has = !!(body && body.trim());
      doc.setFont("helvetica", has ? "normal" : "italic");
      doc.setFontSize(10.5);
      if (has) doc.setTextColor(55, 65, 81);
      else doc.setTextColor(...FAINT);
      const lines = doc.splitTextToSize(has ? body!.trim() : "Sem registros.", contentWidth) as string[];
      for (const line of lines) {
        ensure(16);
        doc.text(line, mx, y);
        y += 15;
      }
      y += 18;
    };

    section("Texto completo", data.notes);
    section("Encaminhamentos", data.outcomes);

    pdfFooter(doc, artistName || "Vistage");

    const safe =
      title.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "ata";
    const saved = await savePdfDoc(doc, `ata-${safe}`);
    if (saved) toast.success(`Ata salva: ata-${safe}.pdf`);
  } catch (e) {
    toast.error(`Não foi possível gerar a ata: ${String(e)}`);
  }
}
