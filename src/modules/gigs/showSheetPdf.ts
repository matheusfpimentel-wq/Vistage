import { toast } from "@/components/ui/toaster";
import { loadIdentity } from "@/modules/identity/api";
import { savePdfDoc } from "@/lib/savePdf";
import {
  createPdf,
  pdfHeader,
  pdfSection,
  pdfFooter,
  textDuo,
  drawBullet,
  dotJoin,
  accentRgb,
  PDF_MARGIN,
  PDF_BOTTOM,
  SOFT,
  FAINT,
} from "@/lib/pdfKit";
import { formatCurrency, formatDate } from "@/lib/format";
import { gigDisplayName } from "./displayName";
import { parsePrepState, PREP_GROUPS } from "./prep";
import type { StageSlot } from "@/modules/foco/api";
import type { SetlistTrack } from "./setlist";
import type { Gig } from "./types";

/** Dados auxiliares já carregados no diálogo, passados prontos pro builder. */
export type ShowSheetExtra = {
  dayContactName: string | null;
  dayContactPhone: string | null;
  slots: StageSlot[];
  /** Faixas do setlist mais recente (vazio = sem setlist). */
  tracks: SetlistTrack[];
  /** Listas VIP / cortesias: nome da lista + nomes dos membros. */
  vipLists: { name: string; members: string[] }[];
};

/**
 * Gera a Show Sheet (folha de palco) da GIG em PDF — um one-pager com o que
 * importa na hora de tocar. Chrome do pdfKit: texto sanitizado + separadores
 * desenhados (nunca viram quadrado) e salvamento pelo diálogo nativo.
 * Cada seção é pulada quando está vazia.
 */
export async function printShowSheet(gig: Gig, extra: ShowSheetExtra): Promise<void> {
  try {
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
    const contentWidth = doc.internal.pageSize.getWidth() - mx * 2;
    const accent = accentRgb();

    const title = gigDisplayName(gig) || "Show Sheet";
    const dateLabel = formatDate(gig.date);
    let y = pdfHeader(doc, {
      kicker: artistName || "Show sheet",
      title,
      meta: [dateLabel !== "—" ? dateLabel : null, gig.venue_name, gig.venue_city],
      accent,
    });

    function checkPage(needed = 24) {
      if (y + needed > pageHeight - PDF_BOTTOM) {
        doc.addPage();
        y = 64;
      }
    }

    // Endereço da venue (se houver)
    if (gig.venue_address && gig.venue_address.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...SOFT);
      const addrLines = doc.splitTextToSize(gig.venue_address.trim(), contentWidth) as string[];
      for (const line of addrLines) {
        checkPage(14);
        doc.text(line, mx, y);
        y += 13;
      }
      y += 12;
    }

    function bodyLine(text: string, indent = 0, size = 10.5) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(55, 65, 81);
      const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
      for (const line of lines) {
        checkPage(16);
        doc.text(line, mx + indent, y);
        y += 15;
      }
    }

    // Cachê
    if ((gig.cache_amount ?? 0) > 0) {
      checkPage(36);
      y = pdfSection(doc, y, "Cachê", accent);
      bodyLine(formatCurrency(gig.cache_amount));
      y += 12;
    }

    // Contato do dia (nome · telefone com pontinho desenhado)
    if (extra.dayContactName && extra.dayContactName.trim()) {
      checkPage(36);
      y = pdfSection(doc, y, "Contato do dia", accent);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(55, 65, 81);
      dotJoin(doc, [extra.dayContactName, extra.dayContactPhone ?? ""], mx, y, FAINT);
      y += 27;
    }

    // Set / horários
    const slots = extra.slots.filter((s) => s.start || s.end);
    if (slots.length > 0) {
      checkPage(36);
      y = pdfSection(doc, y, "Set / horários", accent);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(55, 65, 81);
      const slotTexts = slots.map((s) => (s.start && s.end ? `${s.start}-${s.end}` : s.start || s.end || ""));
      dotJoin(doc, slotTexts, mx, y, FAINT);
      y += 27;
    }

    // Setlist (título · artista com pontinho desenhado)
    if (extra.tracks.length > 0) {
      checkPage(36);
      y = pdfSection(doc, y, "Setlist", accent);
      extra.tracks.forEach((t, i) => {
        checkPage(16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...FAINT);
        doc.text(String(i + 1), mx + 12, y, { align: "right" });
        textDuo(doc, mx + 20, y, contentWidth - 20, t.title, t.artist?.trim());
        y += 15;
      });
      y += 12;
    }

    // Preparação (apenas itens feitos)
    const prepState = parsePrepState(gig.prep_state);
    const doneLabels = PREP_GROUPS.flatMap((grp) => grp.items)
      .filter((it) => prepState[it.id] === 1)
      .map((it) => it.label);
    if (doneLabels.length > 0) {
      checkPage(36);
      y = pdfSection(doc, y, "Preparação", accent);
      for (const label of doneLabels) {
        checkPage(14);
        drawBullet(doc, mx + 3, y, accent);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(55, 65, 81);
        doc.text(label, mx + 14, y);
        y += 14;
      }
      y += 12;
    }

    // VIP / cortesias
    const vipLists = extra.vipLists.filter((l) => l.members.length > 0);
    if (vipLists.length > 0) {
      checkPage(36);
      y = pdfSection(doc, y, "VIP / cortesias", accent);
      for (const list of vipLists) {
        checkPage(16);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(55, 65, 81);
        doc.text(list.name, mx, y);
        y += 15;
        list.members.forEach((m, i) => {
          checkPage(14);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...FAINT);
          doc.text(String(i + 1), mx + 22, y, { align: "right" });
          doc.setTextColor(55, 65, 81);
          doc.text(m, mx + 30, y);
          y += 14;
        });
        y += 6;
      }
    }

    pdfFooter(doc, artistName || "Vistage");

    const safe =
      title.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") ||
      "gig";
    const saved = await savePdfDoc(doc, `show-sheet-${safe}`);
    if (saved) toast.success(`Show Sheet salva: show-sheet-${safe}.pdf`);
  } catch (e) {
    toast.error(`Não foi possível gerar a Show Sheet: ${String(e)}`);
  }
}
