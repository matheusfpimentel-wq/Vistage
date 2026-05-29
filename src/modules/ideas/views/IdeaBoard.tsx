import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STICKY_COLORS, heatColor, heatLabel, type Idea } from "../types";

type Props = {
  items: Idea[];
  onEdit: (i: Idea) => void;
};

/**
 * Mural visual de ideias — grid de post-its em tons pastel.
 * Os tons rotacionam por ordem da ideia pra dar variedade visual.
 */
export function IdeaBoard({ items, onEdit }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Solta uma ideia com Ctrl/Cmd + I — vai aparecer no mural.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((i, idx) => (
        <button
          key={i.id}
          onClick={() => onEdit(i)}
          className={cn(
            "flex h-full flex-col gap-2 rounded-md border-2 p-3 text-left transition hover:scale-[1.02] hover:shadow-md",
            STICKY_COLORS[idx % STICKY_COLORS.length]
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium leading-snug">{i.title}</div>
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
            {i.tags.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="text-xs">
                #{t}
              </Badge>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
