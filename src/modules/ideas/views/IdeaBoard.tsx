import { Flame, Plus, TrendingDown, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { heatBucket, heatCardBg, heatColor, heatLabel, IDEA_HEAT_MAX, type Idea } from "../types";

type Props = {
  items: Idea[];
  onEdit: (i: Idea) => void;
  onConvertToTrack?: (i: Idea) => void;
  onToggleHot?: (i: Idea) => void;
  onDelete?: (id: number) => void;
  /** Cria uma nova ideia — CTA no estado vazio. */
  onCreate?: () => void;
};

/**
 * Mural visual de ideias — grid de post-its em tons pastel.
 * Os tons rotacionam por ordem da ideia pra dar variedade visual.
 */
export function IdeaBoard({ items, onEdit, onToggleHot, onDelete, onCreate }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-12 text-center">
        {onCreate && (
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" /> Nova ideia
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((i) => (
        <div
          key={i.id}
          className={cn(
            "group relative flex h-full flex-col gap-2 rounded-md border-2 p-3 text-left transition hover:scale-[1.02] hover:shadow-md",
            heatCardBg(i.heat)
          )}
        >
          <button
            onClick={() => onEdit(i)}
            className="flex flex-col gap-2 text-left w-full"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium leading-snug pr-6">{i.title}</div>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-1.5 text-xs",
                  heatColor(i.heat)
                )}
              >
                {heatLabel(i.heat)}
              </span>
            </div>
            {i.body && (
              <p className="line-clamp-5 text-xs text-muted-foreground whitespace-pre-wrap">
                {i.body}
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-1 text-xs">
              {i.category && (
                <Badge variant="secondary" className="text-xs">
                  {i.category}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {i.maturation}
              </Badge>
              {i.currentHeat != null && heatBucket(i.currentHeat) < i.heat && (
                <Badge
                  variant="outline"
                  className="gap-0.5 border-sky-500/30 text-xs text-sky-500"
                  title="Esfriando pela inatividade: toque pra reaquecer"
                >
                  <TrendingDown className="h-3 w-3" /> esfriando
                </Badge>
              )}
              {i.tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="outline" className="text-xs">
                  #{t}
                </Badge>
              ))}
            </div>
          </button>
          {onToggleHot && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleHot(i); }}
              className={cn(
                "absolute right-8 top-2 rounded p-0.5 transition",
                i.heat === IDEA_HEAT_MAX
                  ? "flex text-red-500"
                  : "hidden text-muted-foreground hover:text-red-500 group-hover:flex"
              )}
              aria-label={i.heat === IDEA_HEAT_MAX ? "Desmarcar ideia quente" : "Marcar como ideia quente"}
              title={i.heat === IDEA_HEAT_MAX ? "Ideia quente" : "Marcar como quente"}
            >
              <Flame className={cn("h-3.5 w-3.5", i.heat === IDEA_HEAT_MAX && "fill-current")} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(i.id); }}
              className="absolute right-2 top-2 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:flex"
              aria-label="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
