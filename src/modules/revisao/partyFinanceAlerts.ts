import { getDb } from "@/lib/db";
import { toLocalISODate } from "@/lib/format";
import { getDisabledRuleIds, getFestaSalesPct, getLoteSoldPct } from "./ruleConfig";
import { ruleIdForKey, type AlertItem } from "./alerts";

/**
 * Alertas de DINHEIRO e de PRONTIDÃO DE FESTA — a parte "dinheiro em primeiro
 * plano" da reforma. Disparam quando há prazo, custo ou meta em risco (não por
 * tempo decorrido). Carregados via DB direto (como os loaders do sininho) e
 * usados tanto no sininho quanto na central. NUNCA são pausáveis (são caixa/prazo).
 *
 * Respeitam as regras desligadas no catálogo (Configurações avançadas) — cada um
 * tem uma entrada builtin correspondente, com 🔒 nas de dinheiro/fisco.
 */

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function addDaysISO(days: number): string {
  // Data LOCAL +N dias (não UTC) — senão à noite no Brasil (UTC-3) pularia 1 dia.
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}
function daysUntil(dateISO: string): number {
  return Math.max(0, Math.ceil((new Date(dateISO + "T00:00:00").getTime() - Date.now()) / 86400000));
}

export async function loadPartyFinanceAlerts(): Promise<AlertItem[]> {
  const db = getDb();
  const out: AlertItem[] = [];
  const today = toLocalISODate();
  const in14 = addDaysISO(14);

  // (Removidos) "Recebíveis acumulados acima do limiar" e "Recebível previsto
  // venceu" saíram dos alertas — somar/atrasar recebíveis virava ruído fora da
  // lista declarada.

  // 🔒 Receita realizada do mês abaixo do custo fixo (só após o dia 15, p/ não
  //    dar falso positivo no começo do mês).
  try {
    if (new Date().getDate() >= 15) {
      const ym = today.slice(0, 7);
      const inc = await db.select<{ total: number }[]>(
        "SELECT COALESCE(SUM(amount),0) as total FROM finance_transactions WHERE kind='income' AND status='Recebido' AND date BETWEEN $1 AND $2",
        [`${ym}-01`, `${ym}-31`]
      );
      const fix = await db.select<{ total: number }[]>(
        "SELECT COALESCE(SUM(amount),0) as total FROM finance_recurring WHERE kind='expense' AND active=1"
      );
      const realized = inc[0]?.total ?? 0;
      const fixed = fix[0]?.total ?? 0;
      if (fixed > 0 && realized < fixed) {
        out.push({
          key: "receita-abaixo-custo-fixo",
          icon: "warning", to: "/financeiro", critical: true, severidade: "critico",
          label: `Receita realizada do mês (${fmt(realized)}) abaixo do custo fixo (${fmt(fixed)}).`,
        });
      }
    }
  } catch { /* ignore */ }

  // 3) Festa em ≤14 dias com vendas abaixo do limiar da meta (editável; 0 = nunca).
  try {
    const salesFrac = getFestaSalesPct() / 100;
    const rows = await db.select<{ id: number; title: string; date: string; meta: number; sold: number }[]>(
      `SELECT p.id, p.title, p.date,
              COALESCE(SUM(t.quantity_total),0) as meta,
              COALESCE(SUM(t.quantity_sold),0) as sold
         FROM parties p JOIN party_tickets t ON t.party_id = p.id
        WHERE p.status IN ('Confirmada','Planejando') AND p.date IS NOT NULL
          AND p.date >= $1 AND p.date <= $2
        GROUP BY p.id
       HAVING meta > 0 AND (sold * 1.0 / meta) < ${salesFrac}`,
      [today, in14]
    );
    for (const p of rows) {
      const pct = Math.round((p.sold / p.meta) * 100);
      out.push({
        key: `festa-vendas-baixas-${p.id}`,
        icon: "party", to: `/festas?open=${p.id}`, critical: false, severidade: "atencao",
        label: `Festa "${p.title}" em ${daysUntil(p.date)}d com vendas em ${pct}% da meta: campanha em apuros.`,
      });
    }
  } catch { /* ignore */ }

  // 4) Festa com resultado PROJETADO negativo (custo projetado > receita projetada).
  try {
    const parties = await db.select<{ id: number; title: string; sponsors: string | null }[]>(
      `SELECT id, title, sponsors FROM parties
        WHERE status IN ('Confirmada','Planejando') AND date IS NOT NULL AND date >= $1`,
      [today]
    );
    for (const p of parties) {
      const tk = await db.select<{ price: number; qt: number }[]>(
        "SELECT price, COALESCE(quantity_total,0) as qt FROM party_tickets WHERE party_id = $1",
        [p.id]
      );
      const bud = await db.select<{ total: number }[]>(
        "SELECT COALESCE(SUM(projected_amount),0) as total FROM party_budget_items WHERE party_id = $1",
        [p.id]
      );
      const ticketRev = tk.reduce((s, t) => s + t.price * t.qt, 0);
      let sponsorRev = 0;
      try {
        const arr = p.sponsors ? (JSON.parse(p.sponsors) as { amount_cents?: number }[]) : [];
        if (Array.isArray(arr)) sponsorRev = arr.reduce((s, x) => s + (x?.amount_cents ?? 0) / 100, 0);
      } catch { /* sponsors malformado */ }
      const projRevenue = ticketRev + sponsorRev;
      const projCost = bud[0]?.total ?? 0;
      if (projCost > 0 && projCost > projRevenue) {
        out.push({
          key: `festa-resultado-negativo-${p.id}`,
          icon: "warning", to: `/festas?open=${p.id}`, critical: true, severidade: "critico",
          label: `Festa "${p.title}" com resultado projetado negativo: custo ${fmt(projCost)} > receita ${fmt(projRevenue)}.`,
        });
      }
    }
  } catch { /* ignore */ }

  // (Removidos) "Festa sem venue" e "Festa sem run-of-show" saíram do catálogo —
  // ficam fora da lista enxuta de alertas de festa (vendas, resultado, lote).

  // Lote esgotando (acima do limiar vendido, editável) — abrir o próximo.
  try {
    const loteFrac = getLoteSoldPct() / 100;
    const rows = await db.select<{ id: number; title: string; name: string; sold: number; total: number }[]>(
      `SELECT p.id, p.title, t.name, t.quantity_sold as sold, t.quantity_total as total
         FROM party_tickets t JOIN parties p ON p.id = t.party_id
        WHERE p.date IS NOT NULL AND p.date >= $1
          AND t.quantity_total > 0 AND t.quantity_sold < t.quantity_total
          AND (t.quantity_sold * 1.0 / t.quantity_total) >= ${loteFrac}`,
      [today]
    );
    for (const r of rows) {
      const pct = Math.round((r.sold / r.total) * 100);
      out.push({
        key: `lote-esgotando-${r.id}-${r.name}`,
        icon: "zap", to: `/festas?open=${r.id}`, critical: false, severidade: "info",
        label: `Lote "${r.name}" da festa "${r.title}" ${pct}% vendido; hora de abrir o próximo.`,
      });
    }
  } catch { /* ignore */ }

  // Respeita as regras desligadas no catálogo (cada alerta casa por id/prefixo).
  const disabled = new Set(getDisabledRuleIds());
  return out.filter((a) => !disabled.has(ruleIdForKey(a.key)));
}
