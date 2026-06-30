import { Lightbulb, Music, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { heatColor, heatLabel, type Idea } from "../types";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/shared/EmptyState";

type Props = {
  items: Idea[];
  onEdit: (i: Idea) => void;
  onDelete: (i: Idea) => void;
  onConvertToTrack?: (i: Idea) => void;
};

export function IdeaList({ items, onEdit, onDelete, onConvertToTrack }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="Nenhuma ideia ainda."
      />
    );
  }
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div
          key={i.id}
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
          onClick={() => onEdit(i)}
          title="Clique pra editar"
        >
          <div className="flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(i);
                }}
                className="text-left text-sm font-medium hover:underline"
              >
                {i.title}
              </button>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs",
                    heatColor(i.heat)
                  )}
                >
                  {heatLabel(i.heat)}
                </span>
                <Badge variant="outline">{i.maturation}</Badge>
              </div>
            </div>
            {i.body && (
              <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                {i.body}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {i.category && (
                <Badge variant="secondary" className="text-xs">
                  {i.category}
                </Badge>
              )}
              {i.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-xs">
                  #{t}
                </Badge>
              ))}
              <span className="ml-auto tabular-nums">{formatDate(i.updated_at.slice(0, 10))}</span>
            </div>
          </div>
          <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            {onConvertToTrack && i.maturation !== "Arquivada" && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onConvertToTrack(i)}
                aria-label="Converter em track"
                title="Converter em track"
              >
                <Music className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(i)}
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(i)}
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
