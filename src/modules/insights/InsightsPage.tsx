import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Lightbulb, Search } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { exportInsightsTxt, listInsights } from "./api";
import {
  SOURCE_COLOR,
  SOURCE_LABEL,
  SOURCE_ROUTE,
  type InsightHit,
  type InsightSource,
} from "./types";

const SOURCES: InsightSource[] = ["gig", "track", "party", "idea"];

export function InsightsPage() {
  const [hits, setHits] = useState<InsightHit[]>([]);
  const [source, setSource] = useState<InsightSource | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    const data = await listInsights({ source, search });
    setHits(data);
  }, [source, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const all = hits;
    const map: Record<string, number> = {};
    for (const s of SOURCES) {
      map[s] = all.filter((h) => h.source_type === s).length;
    }
    return map;
  }, [hits]);

  function toggleExpand(key: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    try {
      const allHits = await listInsights({ source, search });
      const txt = await exportInsightsTxt(allHits);
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await saveDialog({
        title: "Exportar insights",
        defaultPath: `insights-${stamp}.txt`,
        filters: [{ name: "Texto", extensions: ["txt"] }],
      });
      if (!path) return;
      await writeTextFile(path, txt);
      toast.success("Insights exportados");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  function highlight(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${escapeRegex(query.trim())})`, "gi"));
    return parts.map((p, i) =>
      p.toLowerCase() === query.trim().toLowerCase() ? (
        <mark key={i} className="rounded-sm bg-primary/30 text-primary px-0.5">
          {p}
        </mark>
      ) : (
        p
      )
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Insights</h2>
          <p className="text-sm text-muted-foreground">
            Pool unificado de aprendizados de GIGs, tracks, festas e ideias.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exportar TXT
        </Button>
      </div>

      {/* KPIs por fonte */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSource("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition",
            source === "all"
              ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
              : "border-input text-muted-foreground hover:bg-accent"
          )}
        >
          Todos ({hits.length})
        </button>
        {SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              source === s
                ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
                : cn("border-input hover:bg-accent", SOURCE_COLOR[s])
            )}
          >
            {SOURCE_LABEL[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar conteúdo ou origem…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Feed */}
      {hits.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Lightbulb className="mx-auto mb-2 h-8 w-8 opacity-50" />
          {search || source !== "all"
            ? "Nenhum insight encontrado com esses filtros."
            : "Nenhum insight ainda. Faça debrief de GIGs, registre bloqueios criativos em tracks ou escreva ideias."}
        </div>
      ) : (
        <div className="space-y-2">
          {hits.map((h) => {
            const key = `${h.source_type}-${h.source_id}-${h.occurred_at}`;
            const isExpanded = expanded.has(key);
            const PREVIEW_LEN = 220;
            const needsExpand = h.content.length > PREVIEW_LEN;
            const displayContent =
              !needsExpand || isExpanded
                ? h.content
                : h.content.slice(0, PREVIEW_LEN) + "…";

            return (
              <div
                key={key}
                className="rounded-md border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs font-medium",
                      SOURCE_COLOR[h.source_type]
                    )}
                  >
                    {SOURCE_LABEL[h.source_type]}
                  </span>
                  <button
                    onClick={() => navigate(SOURCE_ROUTE[h.source_type])}
                    className="text-sm font-medium hover:underline"
                  >
                    {h.source_title}
                  </button>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {formatDate(h.occurred_at.slice(0, 10))}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {highlight(displayContent, search)}
                </p>
                {needsExpand && (
                  <button
                    onClick={() => toggleExpand(key)}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    {isExpanded ? "Ver menos" : "Ver mais"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
