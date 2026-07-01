import type { PartyBudgetItem, PartyGuest, PartyTicket } from "./types";

/**
 * P&L da festa — fonte ÚNICA da verdade financeira de uma festa.
 *
 * Antes este cálculo estava duplicado em 4 lugares (OrcamentoTab, PartyCockpit,
 * briefing.ts, api.seriesRollup) com bases divergentes — dois deles somavam
 * `quantity_sold` cru (sem `|| 0`), o que vira `NaN` se a quantidade vier
 * nula. Aqui tudo é coagido a número, então o resultado nunca "explode".
 *
 * Receita = ingressos vendidos + patrocínio. Custo = itens do orçamento +
 * custo variável das cortesias (qtd × custo/cabeça: welcome drink, pulseira,
 * kit). A receita renunciada da cortesia é informativa e NÃO entra no líquido
 * (não sai do caixa) — só o custo variável entra.
 * "Real" usa vendidos/realizado; "Meta/Projetado" usa total/projetado.
 */

const MARKETING_CATEGORY = "Marketing";

export type PartyPnL = {
  /** Ingressos vendidos (soma de quantity_sold). */
  sold: number;
  /** Meta de ingressos (soma de quantity_total). */
  capacity: number;
  /** Receita de ingressos realizada (preço × vendidos). */
  ticketRevenueReal: number;
  /** Receita de ingressos na meta (preço × total). */
  ticketRevenueMeta: number;
  /** Patrocínio (amount_cents → reais). */
  sponsorRevenue: number;
  /** Receita real total (ingressos vendidos + patrocínio). */
  revenueReal: number;
  /** Custo projetado (soma de projected_amount). */
  costProjected: number;
  /** Custo realizado (soma de actual_amount). */
  costActual: number;
  /** Custo realizado só da categoria Marketing (base do CAC). */
  marketingActual: number;
  /** Custo variável real das cortesias (qtd × custo/cabeça) — já embutido em costProjected/costActual. */
  compVariableCost: number;
  /** Receita renunciada em cortesias (qtd × preço de ref.) — informativo, NÃO entra no líquido. */
  compForgoneRevenue: number;
  /** Resultado líquido real = receita real − custo realizado. */
  netReal: number;
  /** Resultado líquido projetado = receita-meta − custo projetado. */
  netProjected: number;
  /** Custo de aquisição por comprador (marketing / vendidos); null se 0 vendidos. */
  cac: number | null;
};

export function computePartyPnL(
  tickets: Pick<PartyTicket, "price" | "quantity_sold" | "quantity_total">[],
  items: Pick<PartyBudgetItem, "category" | "projected_amount" | "actual_amount">[],
  sponsors: { amount_cents: number }[],
  guests: Pick<PartyGuest, "quantity" | "unit_cost" | "ref_price">[] = [],
): PartyPnL {
  let sold = 0;
  let capacity = 0;
  let ticketRevenueReal = 0;
  let ticketRevenueMeta = 0;
  for (const t of tickets) {
    const qSold = t.quantity_sold || 0;
    const qTotal = t.quantity_total || 0;
    sold += qSold;
    capacity += qTotal;
    ticketRevenueReal += t.price * qSold;
    ticketRevenueMeta += t.price * qTotal;
  }

  const sponsorRevenue = sponsors.reduce((s, sp) => s + (sp.amount_cents || 0) / 100, 0);

  let costProjected = 0;
  let costActual = 0;
  let marketingActual = 0;
  for (const i of items) {
    costProjected += i.projected_amount || 0;
    const actual = i.actual_amount ?? 0;
    costActual += actual;
    if (i.category === MARKETING_CATEGORY) marketingActual += actual;
  }

  let compVariableCost = 0;
  let compForgoneRevenue = 0;
  for (const g of guests) {
    const q = g.quantity || 0;
    compVariableCost += q * (g.unit_cost || 0);
    compForgoneRevenue += q * (g.ref_price || 0);
  }
  // O custo variável da cortesia é caixa real: entra tanto no projetado quanto
  // no realizado (você já planejou e vai gastar o drink/pulseira por cabeça).
  const costProjectedTotal = costProjected + compVariableCost;
  const costActualTotal = costActual + compVariableCost;

  const revenueReal = ticketRevenueReal + sponsorRevenue;
  return {
    sold,
    capacity,
    ticketRevenueReal,
    ticketRevenueMeta,
    sponsorRevenue,
    revenueReal,
    costProjected: costProjectedTotal,
    costActual: costActualTotal,
    marketingActual,
    compVariableCost,
    compForgoneRevenue,
    netReal: revenueReal - costActualTotal,
    netProjected: ticketRevenueMeta + sponsorRevenue - costProjectedTotal,
    cac: sold > 0 ? marketingActual / sold : null,
  };
}
