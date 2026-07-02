/**
 * Cálculo do veredito da Viabilidade — puro e compartilhado. A Viabilidade usa
 * para o semáforo/break-even; a Concretização reusa para mostrar "projetado vs
 * realizado" (financeiro projetado = resultado do veredito no público esperado).
 */

export function pctOf(s: string | number | null | undefined): number {
  const n = parseFloat(String(s ?? "").replace(",", ".").replace("%", ""));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}
export function num(s: string | number | null | undefined): number {
  const n = typeof s === "number" ? s : parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type ViabilityPremissas = {
  publicoEsperado: number;
  precoMedio: number;
  acordoTipo: string;
  acordoTermos: string;
  acordoValor: number;
  patrocinio: number;
  barPerCapita: number;
};

export type Verdict = {
  breakEvenPeople: number | null;
  revPerPerson: number;
  resultado: number;
  receitaBase: number;
  margem: number | null;
  light: "verde" | "ambar" | "vermelho";
  exceedsCapacity: boolean;
};

/** Lê as premissas da Viabilidade a partir dos campos JSON da etapa. */
export function readViabilityPremissas(fields: Record<string, string | number | null> | undefined): ViabilityPremissas {
  const f = fields ?? {};
  return {
    publicoEsperado: num(f.publico_esperado),
    precoMedio: num(f.preco_medio),
    acordoTipo: typeof f.acordo_tipo === "string" ? f.acordo_tipo : "",
    acordoTermos: typeof f.acordo_termos === "string" ? f.acordo_termos : "",
    acordoValor: num(f.acordo_valor),
    patrocinio: num(f.patrocinio),
    barPerCapita: num(f.bar_per_capita),
  };
}

/**
 * Veredito honesto: quantas pessoas empatam e qual o resultado no público
 * esperado (não na capacidade máxima). Considera preço, o efeito do acordo com
 * a casa (aluguel fixo x % da bilheteria x % do bar x cachê) e extras.
 */
export function computeVerdict(p: ViabilityPremissas, custosProjetados: number, capacity: number | null): Verdict {
  const ticketCutPct = p.acordoTipo === "pct_bilheteria" ? pctOf(p.acordoTermos) : 0;
  const netTicketPerPerson = p.precoMedio * (1 - ticketCutPct / 100);
  const barPerPerson = p.acordoTipo === "pct_bar" ? p.barPerCapita : 0;
  const revPerPerson = netTicketPerPerson + barPerPerson;

  // Receita fixa que abate os custos: patrocínio + cachê da casa (se for o acordo).
  const fixedRevenue = p.patrocinio + (p.acordoTipo === "cache" ? p.acordoValor : 0);
  const fixedToCover = Math.max(0, custosProjetados - fixedRevenue);
  const breakEvenPeople = revPerPerson > 0 ? Math.ceil(fixedToCover / revPerPerson) : null;

  const P = Math.max(0, p.publicoEsperado);
  const receitaBase = P * revPerPerson + fixedRevenue;
  const resultado = receitaBase - custosProjetados;
  const margem = receitaBase > 0 ? resultado / receitaBase : null;

  const exceedsCapacity =
    capacity != null && capacity > 0 && breakEvenPeople != null && breakEvenPeople >= capacity;

  let light: Verdict["light"];
  if (resultado < 0 || exceedsCapacity) light = "vermelho";
  else if (margem != null && margem >= 0.15) light = "verde";
  else light = "ambar";

  return { breakEvenPeople, revPerPerson, resultado, receitaBase, margem, light, exceedsCapacity };
}
