import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  IDEA_MATURATIONS,
  heatColor,
  heatLabel,
  type Idea,
  type IdeaMaturation,
} from "../types";
import { updateIdea } from "../api";

type Props = {
  items: Idea[];
  onEdit: (i: Idea) => void;
  onConvertToTrack?: (i: Idea) => void;
  onDelete?: (id: number) => void;
  onRefresh: () => void;
};

export function IdeaKanban({ items, onEdit, onDelete, onRefresh }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {IDEA_MATURATIONS.map((m) => (
        <Column
          key={m}
          maturation={m}
          items={items.filter((i) => i.maturation === m)}
          onEdit={onEdit}
          onDelete={onDelete}
          dragging={dragging}
          setDragging={setDragging}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

function Column({
  maturation,
  items,
  onEdit,
  onDelete,
  dragging,
  setDragging,
  onRefresh,
}: {
  maturation: IdeaMaturation;
  items: Idea[];
  onEdit: (i: Idea) => void;
  onDelete?: (id: number) => void;
  dragging: number | null;
  setDragging: (id: number | null) => void;
  onRefresh: () => void;
}) {
  return (
    <div
      className="flex flex-col rounded-md border bg-muted/30"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async () => {
        if (dragging != null) {
          await updateIdea({ id: dragging, maturation });
          setDragging(null);
          onRefresh();
        }
      }}
    >
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
          <div
            key={i.id}
            draggable
            onDragStart={() => setDragging(i.id)}
            onDragEnd={() => setDragging(null)}
            className="group relative w-full rounded-md border bg-background p-2 text-left text-sm transition hover:border-primary cursor-grab active:cursor-grabbing"
          >
            <button
              onClick={() => onEdit(i)}
              className="w-full text-left"
            >
              <div className="font-medium pr-6">{i.title}</div>
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
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(i.id); }}
                className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:flex"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
