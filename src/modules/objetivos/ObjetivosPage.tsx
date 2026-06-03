import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { listOkrs, deleteOkr, okrProgress, type Okr, type KeyResult } from "./api";
import { OkrForm } from "./forms/OkrForm";

export function ObjetivosPage() {
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Okr | null>(null);

  async function refresh() {
    setOkrs(await listOkrs());
  }

  useEffect(() => { void refresh(); }, []);

  const byQuarter = okrs.reduce<Record<string, Okr[]>>((acc, o) => {
    (acc[o.quarter] ??= []).push(o);
    return acc;
  }, {});

  const quarters = Object.keys(byQuarter).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">OKRs</h2>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Em dia (≥70%)</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />Em risco (40–69%)</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-primary/60" />Atrasado (&lt;40%)</span>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Novo OKR
        </Button>
      </div>

      {quarters.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhum OKR ainda. Crie seu primeiro objetivo trimestral.
        </div>
      ) : (
        <div className="space-y-8">
          {quarters.map((q) => (
            <div key={q}>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">{q}</h3>
              <div className="space-y-4">
                {byQuarter[q].map((okr) => (
                  <OkrCard
                    key={okr.id}
                    okr={okr}
                    onEdit={() => { setEditing(okr); setFormOpen(true); }}
                    onDelete={async () => {
                      if (!(await confirmDialog({ title: "Excluir", description: "Excluir este OKR?", confirmLabel: "Excluir", destructive: true }))) return;
                      await deleteOkr(okr.id);
                      toast.success("OKR excluído");
                      void refresh();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <OkrForm
        open={formOpen}
        onOpenChange={setFormOpen}
        okr={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function OkrCard({
  okr,
  onEdit,
  onDelete,
}: {
  okr: Okr;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const progress = okrProgress(okr);
  const pct = Math.round(progress * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Target className={cn("mt-0.5 h-4 w-4 shrink-0", pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-muted-foreground")} />
          <div className="flex-1">
            <CardTitle className="text-base leading-snug">{okr.objective}</CardTitle>
            <CardDescription className="mt-1">
              {okr.key_results.length} key result{okr.key_results.length !== 1 ? "s" : ""} · {pct}% concluído
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <ProgressBar value={progress} />
      </CardHeader>

      {expanded && okr.key_results.length > 0 && (
        <CardContent className="space-y-3 pt-0">
          {okr.key_results.map((kr, i) => (
            <KrRow key={kr.id} kr={kr} index={i} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function KrRow({ kr, index }: { kr: KeyResult; index: number }) {
  const pct = kr.target > 0 ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
  const isAuto = kr.metric_source !== "manual";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          <span className="mr-1 font-medium text-foreground">KR{index + 1}</span>
          {kr.description}
          {isAuto && <span className="ml-1 text-[10px] text-primary/70">(auto)</span>}
        </span>
        <span className="tabular-nums text-xs">
          {kr.current} / {kr.target} {kr.unit}
        </span>
      </div>
      <ProgressBar value={pct / 100} size="sm" />
    </div>
  );
}

function ProgressBar({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const pct = Math.round(Math.min(1, value) * 100);
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2")}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary/60"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
