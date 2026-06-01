import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  IDEA_MATURATIONS,
  heatColor,
  heatLabel,
  type Idea,
  type IdeaMaturation,
} from "../types";

type Props = {
  items: Idea[];
  onEdit: (i: Idea) => void;
  onConvertToTrack?: (i: Idea) => void;
};

export function IdeaKanban({ items, onEdit }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {IDEA_MATURATIONS.map((m) => (
        <Column
          key={m}
          maturation={m}
          items={items.filter((i) => i.maturation === m)}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

function Column({
  maturation,
  items,
  onEdit,
}: {
  maturation: IdeaMaturation;
  items: Idea[];
  onEdit: (i: Idea) => void;
}) {
  return (
    <div className="flex flex-col rounded-md border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">{maturation}</div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {items.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            sem ideias
          </div>
        )}
        {items.map((i) => (
          <button
            key={i.id}
            onClick={() => onEdit(i)}
            className="w-full rounded-md border bg-background p-2 text-left text-sm transition hover:border-primary"
          >
            <div className="font-medium">{i.title}</div>
            <div className="mt-1 flex items-center gap-1">
              <span
                className={cn(
                  "rounded-md border px-1.5 text-xs",
                  heatColor(i.heat)
                )}
              >
                {heatLabel(i.heat)}
              </span>
              {i.category && (
                <Badge variant="secondary" className="text-xs">
                  {i.category}
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
