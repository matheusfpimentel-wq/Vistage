import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { evaluateInsightRules } from "@/modules/revisao/customRules";
import type { InsightHit, InsightSource } from "./types";

export type InsightFilters = {
  source?: InsightSource | "all";
  search?: string;
};

/**
 * Banco de insights = aprendizados derivados dos seus dados (view v_insights:
 * GIGs/faixas/festas/ideias) + anotações MANUAIS, menos os que você EXCLUIU.
 * A filtragem por origem/busca e o corte dos excluídos são feitos aqui (em JS)
 * porque a fonte é uma UNION de view + tabela manual.
 */
export async function listInsights(filters: InsightFilters = {}): Promise<InsightHit[]> {
  const db = getDb();
  const [sourceRows, manualRows, dismissedRows, ruleHits] = await Promise.all([
    db.select<InsightHit[]>("SELECT * FROM v_insights").catch(() => [] as InsightHit[]),
    db
      .select<{ id: number; content: string; created_at: string }[]>(
        "SELECT id, content, created_at FROM manual_insights"
      )
      .catch(() => [] as { id: number; content: string; created_at: string }[]),
    db
      .select<{ source_type: string; source_id: number }[]>(
        "SELECT source_type, source_id FROM dismissed_insights"
      )
      .catch(() => [] as { source_type: string; source_id: number }[]),
    evaluateInsightRules().catch(() => [] as { ruleId: number; content: string }[]),
  ]);

  const dismissed = new Set(dismissedRows.map((d) => `${d.source_type}:${d.source_id}`));
  const manual: InsightHit[] = manualRows.map((m) => ({
    source_type: "manual",
    source_id: m.id,
    source_title: "Anotação manual",
    content: m.content,
    occurred_at: m.created_at,
  }));
  // Insights gerados por regras (operadores). São "do agora", então usam a data
  // atual e aparecem no topo.
  const ruleNow = new Date().toISOString();
  const ruleInsights: InsightHit[] = ruleHits.map((h) => ({
    source_type: "rule",
    source_id: h.ruleId,
    source_title: "Regra de insight",
    content: h.content,
    occurred_at: ruleNow,
  }));

  let all: InsightHit[] = [
    ...sourceRows.filter((r) => !dismissed.has(`${r.source_type}:${r.source_id}`)),
    ...manual,
    ...ruleInsights,
  ];

  if (filters.source && filters.source !== "all") {
    all = all.filter((r) => r.source_type === filters.source);
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    all = all.filter(
      (r) =>
        r.content.toLowerCase().includes(q) ||
        r.source_title.toLowerCase().includes(q)
    );
  }
  all.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return all;
}

/** Insights da fonte (não-manuais) que foram excluídos — para poder restaurar. */
export async function listDismissedInsights(): Promise<InsightHit[]> {
  const db = getDb();
  return db
    .select<InsightHit[]>(
      `SELECT v.* FROM v_insights v
        JOIN dismissed_insights d
          ON d.source_type = v.source_type AND d.source_id = v.source_id
       ORDER BY v.occurred_at DESC`
    )
    .catch(() => [] as InsightHit[]);
}

/** Exclui um insight da fonte (não apaga o conteúdo-origem, só some do banco). */
export async function dismissInsight(sourceType: InsightSource, sourceId: number): Promise<void> {
  await getDb().execute(
    `INSERT INTO dismissed_insights (source_type, source_id) VALUES ($1, $2)
     ON CONFLICT(source_type, source_id) DO NOTHING`,
    [sourceType, sourceId]
  );
  emitDataChanged();
}

/** Restaura um insight da fonte que tinha sido excluído. */
export async function restoreInsight(sourceType: InsightSource, sourceId: number): Promise<void> {
  await getDb().execute(
    `DELETE FROM dismissed_insights WHERE source_type = $1 AND source_id = $2`,
    [sourceType, sourceId]
  );
  emitDataChanged();
}

/** Cria uma anotação de insight manual. */
export async function addManualInsight(content: string): Promise<void> {
  await getDb().execute(`INSERT INTO manual_insights (content) VALUES ($1)`, [content]);
  emitDataChanged();
}

/** Remove uma anotação manual de vez. */
export async function deleteManualInsight(id: number): Promise<void> {
  await getDb().execute(`DELETE FROM manual_insights WHERE id = $1`, [id]);
  emitDataChanged();
}

export async function exportInsightsTxt(hits: InsightHit[]): Promise<string> {
  const lines: string[] = [
    `Insights exportados em ${new Date().toLocaleDateString("pt-BR")}`,
    `Total: ${hits.length} insights`,
    "=".repeat(60),
    "",
  ];
  for (const h of hits) {
    const date = h.occurred_at.slice(0, 10);
    lines.push(`[${h.source_type.toUpperCase()}] ${h.source_title} · ${date}`);
    lines.push(h.content);
    lines.push("");
  }
  return lines.join("\n");
}
