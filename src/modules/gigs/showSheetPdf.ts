import { toast } from "@/components/ui/toaster";
import { loadIdentity } from "@/modules/identity/api";
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
 * importa na hora de tocar. Mesmo motor jsPDF da ata da reunião e da ementa
 * (gera arquivo de verdade, que funciona na webview empacotada do Tauri).
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

    // Título: nome de exibição da GIG
    const title = gigDisplayName(gig) || "Show Sheet";
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

    // Meta: data · venue · cidade
    const venueBits = [gig.venue_name, gig.venue_city].filter(
      (x): x is string => !!x && x.trim().length > 0
    );
    const metaBits = [formatDate(gig.date), venueBits.join(" · ")].filter(
      (x) => !!x && x.trim().length > 0 && x !== "—"
    );
    if (metaBits.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90);
      doc.text(metaBits.join("  ·  "), marginX, y);
      y += 16;
    }

    // Endereço da venue (se houver)
    if (gig.venue_address && gig.venue_address.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110);
      const addrLines = doc.splitTextToSize(gig.venue_address.trim(), contentWidth) as string[];
      for (const line of addrLines) {
        checkPage(14);
        doc.text(line, marginX, y);
        y += 13;
      }
    }
    y += 16;

    // Helper: cabeçalho de seção (pula se não houver conteúdo via early return no caller)
    function sectionTitle(label: string) {
      checkPage(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(label, marginX, y);
      y += 18;
    }

    function bodyLine(text: string, indent = 0, size = 11, color = 60) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
      for (const line of lines) {
        checkPage(16);
        doc.text(line, marginX + indent, y);
        y += 15;
      }
    }

    // Cachê
    if ((gig.cache_amount ?? 0) > 0) {
      sectionTitle("Cachê");
      bodyLine(formatCurrency(gig.cache_amount));
      y += 14;
    }

    // Contato do dia
    if (extra.dayContactName && extra.dayContactName.trim()) {
      sectionTitle("Contato do dia");
      const contact = extra.dayContactPhone
        ? `${extra.dayContactName} · ${extra.dayContactPhone}`
        : extra.dayContactName;
      bodyLine(contact);
      y += 14;
    }

    // Set / horários
    const slots = extra.slots.filter((s) => s.start || s.end);
    if (slots.length > 0) {
      sectionTitle("Set / horários");
      const slotText = slots
        .map((s) => (s.start && s.end ? `${s.start}–${s.end}` : s.start || s.end))
        .join("  ·  ");
      bodyLine(slotText);
      y += 14;
    }

    // Setlist
    if (extra.tracks.length > 0) {
      sectionTitle("Setlist");
      extra.tracks.forEach((t, i) => {
        const artist = t.artist?.trim();
        const label = artist ? `${t.title} — ${artist}` : t.title;
        bodyLine(`${i + 1}. ${label}`, 0, 10, 70);
      });
      y += 14;
    }

    // Preparação (apenas itens feitos)
    const prepState = parsePrepState(gig.prep_state);
    const doneLabels = PREP_GROUPS.flatMap((grp) => grp.items)
      .filter((it) => prepState[it.id] === 1)
      .map((it) => it.label);
    if (doneLabels.length > 0) {
      sectionTitle("Preparação");
      for (const label of doneLabels) {
        bodyLine(`• ${label}`, 0, 10, 70);
      }
      y += 14;
    }

    // VIP / cortesias
    const vipLists = extra.vipLists.filter((l) => l.members.length > 0);
    if (vipLists.length > 0) {
      sectionTitle("VIP / cortesias");
      for (const list of vipLists) {
        bodyLine(list.name, 0, 11, 40);
        list.members.forEach((m, i) => bodyLine(`${i + 1}. ${m}`, 12, 10, 70));
        y += 6;
      }
      y += 8;
    }

    const safe =
      title.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") ||
      "gig";
    doc.save(`show-sheet-${safe}.pdf`);
  } catch (e) {
    toast.error(`Não foi possível gerar a Show Sheet: ${String(e)}`);
  }
}
