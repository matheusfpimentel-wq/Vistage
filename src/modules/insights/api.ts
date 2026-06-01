import { getDb } from "@/lib/db";
import type { InsightHit, InsightSource } from "./types";

export type InsightFilters = {
  source?: InsightSource | "all";
  search?: string;
};

export async function listInsights(filters: InsightFilters = {}): Promise<InsightHit[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.source && filters.source !== "all") {
    params.push(filters.source);
    where.push(`source_type = $${params.length}`);
  }
  if (filters.search && filters.search.trim()) {
    const like = `%${filters.search.trim()}%`;
    params.push(like, like);
    const i = params.length;
    where.push(`(content LIKE $${i - 1} OR source_title LIKE $${i})`);
  }

  const sql =
    "SELECT * FROM v_insights" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY occurred_at DESC";

  return db.select<InsightHit[]>(sql, params);
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
    lines.push(`[${h.source_type.toUpperCase()}] ${h.source_title} — ${date}`);
    lines.push(h.content);
    lines.push("");
  }
  return lines.join("\n");
}
