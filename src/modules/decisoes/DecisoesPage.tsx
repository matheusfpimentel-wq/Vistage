import { useEffect, useState } from "react";
import { AlertCircle, FileQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  DECISION_DOMAINS,
  deleteDecision,
  listDecisions,
  type Decision,
  type DecisionDomain,
} from "./api";
import { DecisaoForm } from "./forms/DecisaoForm";

const EVAL_COLORS: Record<string, string> = {
  Acertou: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
  Errou: "border-destructive/30 text-destructive bg-destructive/10",
  Inconclusivo: "border-amber-500/30 text-amber-400 bg-amber-500/10",
};

export function DecisoesPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [domainFilter, setDomainFilter] = useState<DecisionDomain | "Todas">("Todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);

  async function refresh() {
    const data = await listDecisions(domainFilter === "Todas" ? undefined : domainFilter);
    setDecisions(data);
  }

  useEffect(() => { void refresh(); }, [domainFilter]);

  const pendingOutcome = decisions.filter(
    (d) => d.outcome && !d.outcome_evaluation
  ).length;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(d: Decision) {
    setEditing(d);
    setFormOpen(true);
  }

  async function handleDelete(d: Decision) {
    if (!window.confirm(`Excluir decisão "${d.decision_made}"?`)) return;
    await deleteDecision(d.id);
    toast.success("Decisão excluída");
    void refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Decision Log</h2>
          <p className="text-sm text-muted-foreground">
            Registro explícito de decisões — para revisitar e aprender.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Registrar decisão
        </Button>
      </div>

      {pendingOutcome > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {pendingOutcome} decisão{pendingOutcome > 1 ? "ões" : ""} com outcome registrado mas sem avaliação. Aproveite pra fechar o ciclo!
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select
          value={domainFilter}
          onValueChange={(v) => setDomainFilter(v as DecisionDomain | "Todas")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todos os domínios</SelectItem>
            {DECISION_DOMAINS.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{decisions.length} decisões</span>
      </div>

      {decisions.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <FileQuestion className="mx-auto mb-3 h-8 w-8 opacity-30" />
          Nenhuma decisão registrada ainda. Documente uma decisão importante agora.
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onEdit={() => openEdit(d)}
              onDelete={() => handleDelete(d)}
            />
          ))}
        </div>
      )}

      <DecisaoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        decision={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function DecisionCard({
  decision: d,
  onEdit,
  onDelete,
}: {
  decision: Decision;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const needsReview = d.outcome && !d.outcome_evaluation;

  return (
    <Card className={cn(needsReview && "border-amber-500/30")}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <FileQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-1">
            <CardTitle className="text-sm font-medium leading-snug">
              {d.decision_made}
            </CardTitle>
            <p className="text-xs text-muted-foreground line-clamp-2">{d.context}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{d.domain}</Badge>
            {d.outcome_evaluation && (
              <Badge
                variant="outline"
                className={cn("text-[10px]", EVAL_COLORS[d.outcome_evaluation])}
              >
                {d.outcome_evaluation}
              </Badge>
            )}
            {needsReview && (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                Avaliar
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {d.reasoning && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Raciocínio:</span> {d.reasoning}
          </p>
        )}
        {d.outcome && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Outcome:</span> {d.outcome}
          </p>
        )}
        {d.learned && (
          <p className="text-xs text-emerald-400">
            <span className="font-medium">Aprendizado:</span> {d.learned}
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">{formatDate(d.created_at)}</span>
          <div className="flex gap-0.5">
            <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Excluir">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
