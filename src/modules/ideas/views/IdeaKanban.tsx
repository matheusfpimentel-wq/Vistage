import { Palette, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/kanbanDnd";
import { columnTintStyle, useColumnColors } from "@/lib/kanbanColumnColors";
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

// Cor por coluna: tinge o FUNDO da coluna/agrupador (não os cards). Preferência
// da máquina — não viaja no .vistage. Mesma lógica das Tarefas.
const COLORS_KEY = "vistage.ideas.kanbanColors";

export function IdeaKanban({ items, onEdit, onDelete, onRefresh }: Props) {
  const [colors, setColor] = useColumnColors(COLORS_KEY);

  async function handleMove(id: number, status: string) {
    await updateIdea({ id, maturation: status as IdeaMaturation });
    onRefresh();
  }

  return (
    <KanbanBoard
      onMove={handleMove}
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      {IDEA_MATURATIONS.map((m) => (
        <Column
          key={m}
          maturation={m}
          items={items.filter((i) => i.maturation === m)}
          color={colors[m] ?? null}
          onColor={setColor}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </KanbanBoard>
  );
}

function Column({
  maturation,
  items,
  color,
  onColor,
  onEdit,
  onDelete,
}: {
  maturation: IdeaMaturation;
  items: Idea[];
  color: string | null;
  onColor: (column: string, hex: string | null) => void;
  onEdit: (i: Idea) => void;
  onDelete?: (id: number) => void;
}) {
  return (
    <KanbanColumn
      status={maturation}
      className="flex flex-col rounded-md border bg-muted/30"
      style={columnTintStyle(color)}
    >
      <div className="flex items-center justify-between gap-1 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {color && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          )}
          <span className="truncate text-sm font-medium">{maturation}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline">{items.length}</Badge>
          <label
            className="relative inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title="Cor de fundo desta coluna"
          >
            <input
              type="color"
              value={color ?? "#8b5cf6"}
              onChange={(e) => onColor(maturation, e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Cor da coluna ${maturation}`}
            />
            <Palette className="h-3.5 w-3.5" />
          </label>
          {color && (
            <button
              type="button"
              onClick={() => onColor(maturation, null)}
              className="text-sm leading-none text-muted-foreground hover:text-foreground"
              title="Limpar cor"
              aria-label="Limpar cor"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {items.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            sem ideias
          </div>
        )}
        {items.map((i) => (
          <KanbanCard
            key={i.id}
            id={i.id}
            onClick={() => onEdit(i)}
            className="group relative w-full rounded-md border bg-background p-2 text-left text-sm transition hover:border-primary"
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
            {onDelete && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(i.id);
                }}
                className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:flex"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </KanbanCard>
        ))}
      </div>
    </KanbanColumn>
  );
}
