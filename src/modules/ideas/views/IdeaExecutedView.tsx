import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, PackageCheck, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { getDocDriveLink, openDoc } from "@/modules/biblioteca/documents/api";
import { IDEA_CONVERSION_LABELS, type Idea, type IdeaConversion } from "../types";

/** Cor do selo por tipo de fim — pra bater o olho e saber no que a ideia virou. */
const FIM_BADGE: Record<IdeaConversion, string> = {
  task: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  content: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  gig: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  track: "bg-pink-500/15 text-pink-500 border-pink-500/30",
  document: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  note: "bg-teal-500/15 text-teal-600 border-teal-500/30",
};

// Módulo de destino de cada fim (o link leva pra lá). Documento e Conhecimento
// abrem no alvo exato; os demais levam ao módulo (o registro está lá).
const FIM_ROUTE: Partial<Record<IdeaConversion, string>> = {
  gig: "/gigs",
  track: "/musica",
  content: "/conteudo",
  task: "/tarefas",
};

/**
 * Banco de ideias EXECUTADAS: as que já ganharam um fim (viraram GIG, track,
 * conteúdo, tarefa, documento ou nota). Saíram da lista principal — aqui ficam
 * arquivadas com o SELO do que viraram e um LINK pra abrir o resultado. Dá pra
 * "reabrir" (desfazer o fim, volta pro backlog) ou excluir.
 */
export function IdeaExecutedView({
  items,
  onEdit,
  onReopen,
  onDelete,
}: {
  items: Idea[];
  onEdit: (i: Idea) => void;
  onReopen: (i: Idea) => void;
  onDelete: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="Nenhuma ideia executada ainda."
        description="Quando você der um fim a uma ideia (GIG, track, conteúdo, tarefa, documento ou nota), ela sai da lista principal e fica arquivada aqui, com link pro resultado."
      />
    );
  }

  async function openResult(i: Idea) {
    const fim = i.converted_to;
    if (!fim || i.converted_id == null) return;
    if (fim === "document") {
      setBusy(i.id);
      try {
        const link = await getDocDriveLink(i.converted_id);
        if (link) await openDoc(link);
        else toast.error("Documento não encontrado no Drive (pode ter sido movido/excluído).");
      } finally {
        setBusy(null);
      }
      return;
    }
    if (fim === "note") {
      navigate(`/biblioteca?tab=conhecimento&note=${i.converted_id}`);
      return;
    }
    const route = FIM_ROUTE[fim];
    if (route) navigate(route);
  }

  async function handleReopen(i: Idea) {
    if (
      !(await confirmDialog({
        title: "Reabrir ideia",
        description: `"${i.title}" volta pro backlog "a executar". O que ela gerou continua onde está.`,
        confirmLabel: "Reabrir",
      }))
    )
      return;
    onReopen(i);
  }

  return (
    <div className="space-y-2">
      {items.map((i) => {
        const fim = i.converted_to;
        return (
          <div
            key={i.id}
            className="flex items-center gap-3 rounded-md border bg-card/50 p-3"
          >
            <button
              type="button"
              onClick={() => onEdit(i)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate font-medium">{i.title}</div>
              {i.category && (
                <div className="truncate text-xs text-muted-foreground">{i.category}</div>
              )}
            </button>

            {fim && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                  FIM_BADGE[fim]
                )}
              >
                {IDEA_CONVERSION_LABELS[fim]}
              </span>
            )}

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openResult(i)}
                disabled={busy === i.id}
                title="Abrir o resultado"
              >
                <ExternalLink className="h-4 w-4" /> Abrir
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleReopen(i)}
                title="Reabrir (desfaz o fim, volta pra lista principal)"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(i.id)}
                title="Excluir ideia"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
