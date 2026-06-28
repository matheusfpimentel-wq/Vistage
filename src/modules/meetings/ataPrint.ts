import { toast } from "@/components/ui/toaster";
import { loadIdentity } from "@/modules/identity/api";

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
 * Gera a ata da reunião em PDF (mesmo motor jsPDF do relatório mensal e da
 * ementa). Antes isto usava um iframe oculto + `iframe.print()`, que NÃO dispara
 * o diálogo de impressão na webview do Tauri — o botão "não fazia nada". jsPDF
 * gera um arquivo de verdade, que funciona igual no app empacotado.
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

    // Cabeçalho: nome do artista (se houver)
    if (artistName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(artistName.toUpperCase(), marginX, y);
      y += 18;
    }

    // Título da ata
    const title = data.title || "Reunião";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20);
    const titleLines = doc.splitTextToSize(title, contentWidth) as string[];
    doc.text(titleLines, marginX, y);
    y += titleLines.length * 24;

    // Régua de destaque (cor de marca)
    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(2);
    doc.line(marginX, y - 6, contentRight, y - 6);
    doc.setLineWidth(1);
    y += 14;

    // Meta: data · hora · local
    const metaBits = [formatDateBR(data.date), data.time, data.location].filter(
      (x): x is string => !!x && x.trim().length > 0
    );
    if (metaBits.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90);
      doc.text(metaBits.join("  ·  "), marginX, y);
      y += 16;
    }

    // Participantes
    if (data.participants.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110);
      const pLines = doc.splitTextToSize(
        `Participantes: ${data.participants.join(", ")}`,
        contentWidth
      ) as string[];
      for (const line of pLines) {
        checkPage(14);
        doc.text(line, marginX, y);
        y += 13;
      }
    }
    y += 16;

    // Seções de texto
    function section(label: string, body: string | null) {
      checkPage(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(label, marginX, y);
      y += 18;
      const has = !!(body && body.trim());
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(has ? 60 : 160);
      const lines = doc.splitTextToSize(has ? body!.trim() : "—", contentWidth) as string[];
      for (const line of lines) {
        checkPage(16);
        doc.text(line, marginX, y);
        y += 15;
      }
      y += 14;
    }

    section("Texto completo", data.notes);
    section("Encaminhamentos", data.outcomes);

    const safe =
      title.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "ata";
    doc.save(`ata-${safe}.pdf`);
  } catch (e) {
    toast.error(`Não foi possível gerar a ata: ${String(e)}`);
  }
}
