import { formatCurrency, formatDate } from "@/lib/format";
import { savePdfDoc } from "@/lib/savePdf";
import { computePartyPnL } from "./pnl";
import type {
  PartyBudgetItem,
  PartyDeserialized,
  PartyGuest,
  PartyRunsheetItem,
  PartyStage,
  PartyTicket,
  ViabilityCost,
} from "./types";

/**
 * Briefing por etapa = comunicação com propósito e público. A etapa define o
 * propósito → o propósito define o público → isso define conteúdo e tom. O
 * seletor de público REDIGE números sensíveis (cachês, margem, lucro) para o
 * briefing ser compartilhável sem te expor.
 */
export type BriefingAudience = "interno" | "crew" | "patrocinador";

export const BRIEFING_AUDIENCES: { key: BriefingAudience; label: string; hint: string }[] = [
  { key: "interno", label: "Interno (você)", hint: "Tudo — nada escondido." },
  { key: "crew", label: "Crew / produção", hint: "Esconde cachês e margem." },
  { key: "patrocinador", label: "Patrocinador", hint: "Mostra alcance/público; esconde seu lucro." },
];

export type BriefingSection = { heading: string; lines: string[] };
export type Briefing = {
  title: string;
  subtitle: string;
  audience: BriefingAudience;
  draft: boolean;
  sections: BriefingSection[];
};

export type BriefingData = {
  party: PartyDeserialized;
  stages: PartyStage[];
  tickets: PartyTicket[];
  budget: PartyBudgetItem[];
  guests: PartyGuest[];
  runsheet: PartyRunsheetItem[];
  lineupNames: string[];
  seriesName: string | null;
};

const PURPOSE: Record<string, string> = {
  "Ideação": "Pitch do conceito — alinhar a ideia.",
  "Viabilidade": "Business case (go / no-go).",
  "Marketing": "Brief de campanha (handoff).",
  "Execução": "Doc de produção / advance sheet.",
  "Concretização": "Relatório de resultados.",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}

function parseCosts(raw: unknown): ViabilityCost[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ViabilityCost[]) : [];
  } catch {
    return [];
  }
}

/** Monta o briefing estruturado da etapa, já redigido para o público escolhido. */
export function buildBriefing(
  stageName: string,
  audience: BriefingAudience,
  data: BriefingData
): Briefing {
  const { party, stages, tickets, budget, guests, runsheet, lineupNames, seriesName } = data;
  const stage = stages.find((s) => s.name === stageName);
  const f = stage?.fields ?? {};
  const sections: BriefingSection[] = [];
  const add = (heading: string, lines: (string | null | undefined)[]) => {
    const clean = lines.filter((l): l is string => !!l && l.trim().length > 0);
    if (clean.length) sections.push({ heading, lines: clean });
  };

  // P&L via fonte única (computePartyPnL) — antes era um 4º cálculo divergente
  // que somava quantity_sold cru (sem || 0) e podia virar NaN.
  const pnl = computePartyPnL(tickets, budget, party.sponsors, guests, {
    barRevenue: party.bar_revenue,
    attendance: party.actual_attendance,
  });
  const soldTotal = pnl.sold;
  const revenue = pnl.revenueReal;
  const projectedCost = pnl.costProjected;
  const net = pnl.netReal;

  if (stageName === "Ideação") {
    add("Conceito", [str(f.conceito), str(f.tema) && `Tema: ${str(f.tema)}`, str(f.motivacao) && `Motivação: ${str(f.motivacao)}`]);
    add("Público-alvo", [str(f.publico_alvo)]);
    add("Referências", [str(f.referencias)]);
    add("Praça pretendida", [party.venue_name ? `Venue: ${party.venue_name}` : null, party.expected_capacity ? `Capacidade: ${party.expected_capacity} pessoas` : null]);
  } else if (stageName === "Viabilidade") {
    add("Praça e data", [
      str(f.data_pretendida) ? `Data pretendida: ${formatDate(String(f.data_pretendida))}` : (party.date ? `Data: ${formatDate(party.date)}` : null),
      party.venue_name ? `Venue: ${party.venue_name}` : null,
      f.capacidade ? `Público estimado: ${str(f.capacidade)}` : (party.expected_capacity ? `Público estimado: ${party.expected_capacity}` : null),
    ]);
    const costs = parseCosts(f.custos_necessarios);
    const projected = costs.length ? costs.reduce((s, c) => s + (c.amount || 0), 0) : projectedCost;
    if (audience === "patrocinador") {
      add("Viabilidade", ["Custos e margem omitidos nesta versão."]);
    } else {
      add("Números", [
        `Custos projetados: ${formatCurrency(projected)}`,
        revenue > 0 ? `Receita até agora: ${formatCurrency(revenue)}` : null,
        projected > 0 && party.expected_capacity ? `Break-even aprox.: ${Math.ceil(projected / Math.max(1, ticketAvgPrice(tickets)))} ingressos` : null,
      ]);
    }
    add("Observações", [str(f.viabilidade_notas)]);
  } else if (stageName === "Marketing") {
    add("Objetivo e mensagem", [str(f.estrategia), str(f.meta_alcance) ? `Meta de alcance: ${str(f.meta_alcance)}` : null]);
    add("Canais", [str(f.canais)]);
    add("Verba e artes", [
      audience === "crew" ? null : (str(f.orcamento_mkt) ? `Orçamento de marketing: ${str(f.orcamento_mkt)}` : null),
      str(f.arte_status) ? `Status das artes: ${str(f.arte_status)}` : null,
    ]);
  } else if (stageName === "Execução") {
    add("Quando e onde", [party.date ? `Data: ${formatDate(party.date)}` : null, party.venue_name ? `Venue: ${party.venue_name}` : null]);
    add("Run-of-show", runsheet.map((r) => {
      const t = [r.time, r.end_time].filter(Boolean).join("–");
      return `${t ? t + " — " : ""}${r.title}`;
    }));
    add("Line-up", lineupNames);
    add("Equipe", party.team.map((m) => {
      const money = audience === "crew" ? "" : (m.amount_cents ? ` — ${formatCurrency(m.amount_cents / 100)}` : "");
      return `${m.name}${m.role ? ` (${m.role})` : ""}${money}`;
    }));
    add("Rider técnico", [str(f.rider_tecnico)]);
    if (audience !== "crew") {
      add("Fornecedores / orçamento", budget.map((b) => `${b.description ?? b.subcategory ?? b.category}: ${formatCurrency(b.actual_amount ?? b.projected_amount)}`));
    }
    add("Fornecedores fechados", [str(f.fornecedores_fechados)]);
  } else if (stageName === "Concretização") {
    const expected = party.expected_capacity;
    const real = party.actual_attendance;
    add("Público", [
      real != null ? `Público real: ${real}${expected ? ` / meta ${expected}` : ""}` : null,
      soldTotal > 0 ? `Ingressos vendidos: ${soldTotal}` : null,
    ]);
    if (audience === "patrocinador") {
      add("Alcance", [str(f.aprendizados) ? `Destaques: ${str(f.aprendizados)}` : "Evento realizado — alcance e público acima."]);
    } else {
      add("Resultado financeiro", [
        revenue > 0 ? `Receita: ${formatCurrency(revenue)}` : null,
        pnl.barRevenue > 0 ? `— dos quais bar: ${formatCurrency(pnl.barRevenue)}` : null,
        `Resultado líquido: ${formatCurrency(net)}`,
        pnl.revenuePerHead != null ? `Faturamento por cabeça: ${formatCurrency(pnl.revenuePerHead)}` : null,
        pnl.cac != null
          ? `CAC: ${formatCurrency(pnl.cac)}${
              party.target_cac && party.target_cac > 0
                ? ` (alvo ${formatCurrency(party.target_cac)} — ${pnl.cac <= party.target_cac ? "dentro" : "acima"})`
                : ""
            }`
          : null,
      ]);
      add("Debrief (Plus/Delta)", [
        str(f.plus) ? `Plus (manter): ${str(f.plus)}` : null,
        str(f.delta) ? `Delta (mudar): ${str(f.delta)}` : null,
      ]);
      add("Aprendizados", [str(f.aprendizados)]);
      add("Próximos passos", [str(f.proximos_passos)]);
    }
  }

  if (sections.length === 0) {
    sections.push({ heading: "Sem dados", lines: ["Preencha os campos desta etapa no Workflow para gerar o briefing."] });
  }

  const editionPart = party.edition_label ? ` — ${party.edition_label}` : "";
  const audienceLabel = BRIEFING_AUDIENCES.find((a) => a.key === audience)?.label ?? audience;
  return {
    title: `${seriesName ? seriesName + " · " : ""}${party.title}${editionPart}`,
    subtitle: `Briefing · ${stageName} · ${PURPOSE[stageName] ?? ""} · ${audienceLabel}`,
    audience,
    draft: stage?.status !== "concluida",
    sections,
  };
}

function ticketAvgPrice(tickets: PartyTicket[]): number {
  const withPrice = tickets.filter((t) => t.price > 0);
  if (!withPrice.length) return 0;
  return withPrice.reduce((s, t) => s + t.price, 0) / withPrice.length;
}

/** Renderiza o briefing em markdown (pra copiar e colar no WhatsApp/e-mail). */
export function briefingToMarkdown(b: Briefing): string {
  const out: string[] = [`# ${b.title}`, "", `*${b.subtitle}*`];
  if (b.draft) out.push("", "> ⚠️ Rascunho — esta etapa ainda não está concluída.");
  for (const sec of b.sections) {
    out.push("", `## ${sec.heading}`);
    for (const line of sec.lines) out.push(`- ${line}`);
  }
  return out.join("\n");
}

/** Exporta o briefing em PDF (jsPDF), com marca d'água "rascunho" se aplicável. */
export async function exportBriefingPdf(b: Briefing): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const contentW = pageW - marginX * 2;
  let y = 64;
  const checkPage = (needed = 20) => {
    if (y + needed > pageH - 48) { doc.addPage(); y = 64; if (b.draft) watermark(); }
  };
  const watermark = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(64);
    doc.setTextColor(235);
    doc.text("RASCUNHO", pageW / 2, pageH / 2, { align: "center", angle: 30 });
    doc.setTextColor(20);
  };
  if (b.draft) watermark();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  const titleLines = doc.splitTextToSize(b.title, contentW) as string[];
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  const subLines = doc.splitTextToSize(b.subtitle, contentW) as string[];
  doc.text(subLines, marginX, y);
  y += subLines.length * 14 + 8;

  doc.setDrawColor(210);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  for (const sec of b.sections) {
    checkPage(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(sec.heading, marginX, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60);
    for (const line of sec.lines) {
      const wrapped = doc.splitTextToSize(`•  ${line}`, contentW - 8) as string[];
      for (const w of wrapped) {
        checkPage(15);
        doc.text(w, marginX, y);
        y += 15;
      }
    }
    y += 10;
  }

  const safe = b.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "briefing";
  await savePdfDoc(doc, `briefing-${safe}`);
}
