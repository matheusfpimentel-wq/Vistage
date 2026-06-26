import { getDb } from "@/lib/db";
import { getDisabledRuleIds } from "./ruleConfig";
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

const RECEIVABLES_THRESHOLD = 1000; // R$ — acima disso, recebíveis acumulados viram alerta.

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function addDaysISO(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
function daysUntil(dateISO: string): number {
  return Math.max(0, Math.ceil((new Date(dateISO + "T00:00:00").getTime() - Date.now()) / 86400000));
}

export async function loadPartyFinanceAlerts(): Promise<AlertItem[]> {
  const db = getDb();
  const out: AlertItem[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const in7 = addDaysISO(7);
  const in14 = addDaysISO(14);

  // 1) 🔒 Recebíveis acumulados acima do limiar.
  try {
    const r = await db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(amount),0) as total FROM finance_transactions WHERE kind='income' AND status='Previsto'"
    );
    const total = r[0]?.total ?? 0;
    if (total >= RECEIVABLES_THRESHOLD) {
      out.push({
        key: "recebiveis-acumulados",
        icon: "dollar", to: "/financeiro", critical: true, severidade: "critico",
        label: `Recebíveis acumulados: ${fmt(total)} previstos ainda não recebidos.`,
      });
    }
  } catch { /* tabela ausente — silencioso */ }

  // 2) 🔒 Receita realizada do mês abaixo do custo fixo (só após o dia 15, p/ não
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

  // 3) Festa em ≤14 dias com vendas < 40% da meta.
  try {
    const rows = await db.select<{ id: number; title: string; date: string; meta: number; sold: number }[]>(
      `SELECT p.id, p.title, p.date,
              COALESCE(SUM(t.quantity_total),0) as meta,
              COALESCE(SUM(t.quantity_sold),0) as sold
         FROM parties p JOIN party_tickets t ON t.party_id = p.id
        WHERE p.status IN ('Confirmada','Planejando') AND p.date IS NOT NULL
          AND p.date >= $1 AND p.date <= $2
        GROUP BY p.id
       HAVING meta > 0 AND (sold * 1.0 / meta) < 0.4`,
      [today, in14]
    );
    for (const p of rows) {
      const pct = Math.round((p.sold / p.meta) * 100);
      out.push({
        key: `festa-vendas-baixas-${p.id}`,
        icon: "party", to: `/festas?open=${p.id}`, critical: true, severidade: "critico",
        label: `Festa "${p.title}" em ${daysUntil(p.date)}d com vendas em ${pct}% da meta — campanha em apuros.`,
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

  // 5) Festa confirmada em ≤14 dias sem venue fechado.
  try {
    const rows = await db.select<{ id: number; title: string; date: string }[]>(
      `SELECT id, title, date FROM parties
        WHERE status = 'Confirmada' AND date IS NOT NULL AND date >= $1 AND date <= $2
          AND venue_id IS NULL`,
      [today, in14]
    );
    for (const p of rows) {
      out.push({
        key: `festa-sem-venue-${p.id}`,
        icon: "warning", to: `/festas?open=${p.id}`, critical: true, severidade: "critico",
        label: `Festa "${p.title}" confirmada em ${daysUntil(p.date)}d sem venue fechado.`,
      });
    }
  } catch { /* ignore */ }

  // 6) Festa em ≤7 dias sem run-of-show montado.
  try {
    const rows = await db.select<{ id: number; title: string; date: string }[]>(
      `SELECT id, title, date FROM parties p
        WHERE p.status IN ('Confirmada','Planejando') AND p.date IS NOT NULL
          AND p.date >= $1 AND p.date <= $2
          AND NOT EXISTS (SELECT 1 FROM party_runsheet r WHERE r.party_id = p.id)`,
      [today, in7]
    );
    for (const p of rows) {
      out.push({
        key: `festa-sem-runsheet-${p.id}`,
        icon: "warning", to: `/festas?open=${p.id}`, critical: true, severidade: "critico",
        label: `Festa "${p.title}" em ${daysUntil(p.date)}d sem run-of-show montado.`,
      });
    }
  } catch { /* ignore */ }

  // 7) Lote esgotando (>80% vendido) — oportunidade de abrir o próximo.
  try {
    const rows = await db.select<{ id: number; title: string; name: string; sold: number; total: number }[]>(
      `SELECT p.id, p.title, t.name, t.quantity_sold as sold, t.quantity_total as total
         FROM party_tickets t JOIN parties p ON p.id = t.party_id
        WHERE p.date IS NOT NULL AND p.date >= $1
          AND t.quantity_total > 0 AND t.quantity_sold < t.quantity_total
          AND (t.quantity_sold * 1.0 / t.quantity_total) >= 0.8`,
      [today]
    );
    for (const r of rows) {
      const pct = Math.round((r.sold / r.total) * 100);
      out.push({
        key: `lote-esgotando-${r.id}-${r.name}`,
        icon: "zap", to: `/festas?open=${r.id}`, critical: false, severidade: "atencao",
        label: `Lote "${r.name}" da festa "${r.title}" ${pct}% vendido — hora de abrir o próximo.`,
      });
    }
  } catch { /* ignore */ }

  // Respeita as regras desligadas no catálogo (cada alerta casa por id/prefixo).
  const disabled = new Set(getDisabledRuleIds());
  return out.filter((a) => !disabled.has(ruleIdForKey(a.key)));
}
