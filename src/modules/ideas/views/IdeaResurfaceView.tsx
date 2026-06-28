import { useState } from "react";
import { Archive, Coffee, Combine, Flame, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { archiveIdea, createTaskFromIdea, touchIdea } from "../api";
import { heatBucket, heatColor, heatLabel, type Idea } from "../types";

/** Rótulo aproximado de "há quanto tempo" a ideia está dormente (dias → texto). */
function dormancyLabel(days: number): string {
  const d = Math.round(days);
  if (d >= 75) return `há ${Math.round(d / 30)} meses`;
  if (d >= 45) return "há uns 2 meses";
  if (d >= 25) return "há mais de um mês";
  if (d >= 14) return `há ${Math.round(d / 7)} semanas`;
  return `há ${d} dias`;
}

/**
 * Fila "Ressurgir": traz de volta ideias dormentes (estavam mornas/quentes e
 * esfriaram pela inatividade) com um prompt de olhar fresco e ações rápidas —
 * reaquecer, virar tarefa ou arquivar de vez. Base: efeito de incubação
 * (Sio & Ormerod, 2009) — voltar a um problema após um intervalo rende mais.
 */
export function IdeaResurfaceView({
  items,
  onEdit,
  onChanged,
  onCollide,
}: {
  items: Idea[];
  onEdit: (i: Idea) => void;
  onChanged: () => void;
  onCollide: (i: Idea) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Coffee}
        title="Nada pra ressurgir agora."
        description="Quando uma ideia que andava quente esfriar sem receber um toque, ela aparece aqui pra um olhar fresco."
      />
    );
  }

  async function reheat(i: Idea) {
    setBusy(i.id);
    try {
      await touchIdea(i.id);
      toast.success(`"${i.title}" reaquecida`);
      onChanged();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function toTask(i: Idea) {
    setBusy(i.id);
    try {
      await createTaskFromIdea(i);
      await touchIdea(i.id); // agir nela é tocá-la
      toast.success(`Tarefa criada para "${i.title}"`);
      onChanged();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function archive(i: Idea) {
    if (
      !(await confirmDialog({
        title: "Arquivar",
        description: `Arquivar "${i.title}" de vez? Ela sai do mural e da fila, mas o registro fica guardado.`,
        confirmLabel: "Arquivar",
      }))
    )
      return;
    setBusy(i.id);
    try {
      await archiveIdea(i.id);
      toast.success(`"${i.title}" arquivada`);
      onChanged();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ideias que andavam quentes e esfriaram. Reaqueça, vire tarefa ou arquive de vez — um olhar
        fresco depois de um tempo costuma render mais que uma ideia nova.
      </p>
      {items.map((i) => {
        const hb = heatBucket(i.currentHeat ?? i.heat);
        return (
          <div key={i.id} className="space-y-2 rounded-lg border p-3">
            <button type="button" className="block w-full min-w-0 text-left" onClick={() => onEdit(i)}>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium hover:underline">{i.title}</span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px]", heatColor(hb))}>
                  {heatLabel(hb)}
                </span>
                {i.category && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{i.category}</span>
                )}
              </div>
            </button>
            <p className="text-xs text-muted-foreground">
              Você teve essa ideia {dormancyLabel(i.daysSinceTouch ?? 0)} e ela esfriou. Ainda faz
              sentido? O que mudou desde então?
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy === i.id}
                onClick={() => void reheat(i)}
              >
                <Flame className="h-3.5 w-3.5" /> Reaquecer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy === i.id}
                onClick={() => void toTask(i)}
              >
                <ListChecks className="h-3.5 w-3.5" /> Virar tarefa
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy === i.id}
                onClick={() => onCollide(i)}
              >
                <Combine className="h-3.5 w-3.5" /> Colidir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground"
                disabled={busy === i.id}
                onClick={() => void archive(i)}
              >
                <Archive className="h-3.5 w-3.5" /> Arquivar
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
