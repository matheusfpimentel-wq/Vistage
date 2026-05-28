import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import {
  STANDARD_GIG_TASKS,
  computeDueDate,
  createTask,
} from "../api";
import { formatDate } from "@/lib/format";
import type { Gig } from "@/modules/gigs/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gig: Gig | null;
  onCreated: () => void;
};

export function SuggestStandardTasks({
  open,
  onOpenChange,
  gig,
  onCreated,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // por padrão, todas marcadas
      setSelected(new Set(STANDARD_GIG_TASKS.map((_, i) => i)));
    }
  }, [open]);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleCreate() {
    if (!gig || selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      for (let i = 0; i < STANDARD_GIG_TASKS.length; i++) {
        if (!selected.has(i)) continue;
        const tpl = STANDARD_GIG_TASKS[i];
        await createTask({
          title: tpl.title,
          description: tpl.description ?? null,
          category: "GIG",
          gig_id: gig.id,
          contact_id: gig.promoter_contact_id,
          priority: tpl.priority,
          status: "A fazer",
          due_date: computeDueDate(gig.date, tpl.offsetDays),
          tags: [],
        });
      }
      toast.success(
        `${selected.size} tarefa${selected.size > 1 ? "s" : ""} criada${selected.size > 1 ? "s" : ""}`
      );
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao criar tarefas: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!gig) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Criar tarefas-padrão para esta GIG?
          </DialogTitle>
          <DialogDescription>
            Sugestões baseadas na data de <strong>{gig.venue_name}</strong> em{" "}
            {formatDate(gig.date)}. Desmarque o que não quiser criar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {STANDARD_GIG_TASKS.map((tpl, i) => {
            const due = computeDueDate(gig.date, tpl.offsetDays);
            const checked = selected.has(i);
            return (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(i)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-input accent-primary"
                />
                <div className="flex-1">
                  <div className="font-medium">{tpl.title}</div>
                  {tpl.description && (
                    <div className="text-xs text-muted-foreground">
                      {tpl.description}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="tabular-nums">{formatDate(due)}</div>
                  <div className="opacity-70">
                    {tpl.offsetDays === 0
                      ? "dia da GIG"
                      : tpl.offsetDays < 0
                      ? `${Math.abs(tpl.offsetDays)}d antes`
                      : `${tpl.offsetDays}d depois`}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <Label className="text-xs text-muted-foreground">
          {selected.size} de {STANDARD_GIG_TASKS.length} selecionadas
        </Label>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Pular
          </Button>
          <Button onClick={handleCreate} disabled={saving || selected.size === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar {selected.size} tarefa{selected.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
