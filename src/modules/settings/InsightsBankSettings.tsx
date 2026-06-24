import { useEffect, useState } from "react";
import { ChevronDown, EyeOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  addManualInsight,
  deleteManualInsight,
  dismissInsight,
  listDismissedInsights,
  listInsights,
  restoreInsight,
} from "@/modules/insights/api";
import {
  SOURCE_COLOR,
  SOURCE_LABEL,
  type InsightHit,
  type InsightSource,
} from "@/modules/insights/types";

const SOURCES: (InsightSource | "all")[] = ["all", "gig", "track", "party", "idea", "manual"];

/**
 * Aba "Insights" do Config. avançada: mostra o banco de insights que já existe
 * (aprendizados de GIGs/faixas/festas/ideias) + anotações manuais; deixa
 * EXCLUIR (esconder sem apagar a fonte) e ADICIONAR insights por texto.
 * (Insights por operadores lógicos vêm na parte seguinte.)
 */
export function InsightsBankSettings() {
  const [hits, setHits] = useState<InsightHit[]>([]);
  const [dismissed, setDismissed] = useState<InsightHit[]>([]);
  const [source, setSource] = useState<InsightSource | "all">("all");
  const [text, setText] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const [adding, setAdding] = useState(false);

  function reload() {
    void listInsights().then(setHits);
    void listDismissedInsights().then(setDismissed);
  }
  useEffect(reload, []);

  async function add() {
    if (!text.trim()) return;
    setAdding(true);
    try {
      await addManualInsight(text.trim());
      setText("");
      toast.success("Insight adicionado");
      reload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  async function exclude(h: InsightHit) {
    if (h.source_type === "manual") {
      if (
        !(await confirmDialog({
          title: "Excluir anotação",
          description: "Remover esta anotação manual de vez?",
          confirmLabel: "Excluir",
          destructive: true,
        }))
      )
        return;
      await deleteManualInsight(h.source_id);
    } else {
      await dismissInsight(h.source_type, h.source_id);
    }
    reload();
  }

  async function restore(h: InsightHit) {
    await restoreInsight(h.source_type, h.source_id);
    reload();
  }

  const filtered = source === "all" ? hits : hits.filter((h) => h.source_type === source);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banco de insights</CardTitle>
          <CardDescription>
            Aprendizados que vêm dos seus dados (debriefs de GIG, notas de
            produção/festa, ideias) + anotações suas. Exclua os que não quer e
            adicione os seus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva um insight seu… (ex.: 'Festas de quinta rendem mais que de sábado')"
            className="min-h-[64px]"
          />
          <Button size="sm" onClick={() => void add()} disabled={adding || !text.trim()}>
            <Plus className="h-4 w-4" /> Adicionar insight
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            {SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  source === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {s === "all" ? "Todos" : SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum insight aqui ainda.
            </p>
          ) : (
            filtered.map((h) => (
              <div
                key={`${h.source_type}-${h.source_id}`}
                className="flex items-start justify-between gap-3 rounded-md border p-2.5"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-[10px]", SOURCE_COLOR[h.source_type])}>
                      {SOURCE_LABEL[h.source_type]}
                    </Badge>
                    <span className="truncate text-xs text-muted-foreground">
                      {h.source_title} · {formatDate(h.occurred_at)}
                    </span>
                  </div>
                  <p className="text-sm leading-snug">{h.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label="Excluir do banco"
                  title={h.source_type === "manual" ? "Excluir anotação" : "Excluir do banco"}
                  onClick={() => void exclude(h)}
                >
                  {h.source_type === "manual" ? (
                    <Trash2 className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))
          )}

          {dismissed.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDismissed((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", !showDismissed && "-rotate-90")}
                />
                Excluídos ({dismissed.length})
              </button>
              {showDismissed && (
                <div className="mt-2 space-y-2">
                  {dismissed.map((h) => (
                    <div
                      key={`${h.source_type}-${h.source_id}`}
                      className="flex items-start justify-between gap-3 rounded-md border border-dashed p-2.5 opacity-70"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={cn("text-[10px]", SOURCE_COLOR[h.source_type])}>
                            {SOURCE_LABEL[h.source_type]}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">{h.source_title}</span>
                        </div>
                        <p className="text-sm leading-snug line-through">{h.content}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label="Restaurar"
                        title="Restaurar"
                        onClick={() => void restore(h)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
