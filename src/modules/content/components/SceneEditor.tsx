import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { cn } from "@/lib/utils";
import type { ContentSceneInput } from "../types";

type Props = {
  scenes: ContentSceneInput[];
  onChange: (scenes: ContentSceneInput[]) => void;
};

const EMPTY_SCENE: ContentSceneInput = {
  title: null,
  description: null,
  equipment: [],
  materials: [],
  scenery: null,
};

type SceneRowProps = {
  id: string;
  scene: ContentSceneInput;
  index: number;
  onUpdate: (index: number, patch: Partial<ContentSceneInput>) => void;
  onRemove: (index: number) => void;
};

function SceneRow({ id, scene, index, onUpdate, onRemove }: SceneRowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className="flex cursor-grab touch-none items-center text-muted-foreground/60 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Arrastar cena"
        >
          <GripVertical className="h-4 w-4 shrink-0" />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              Cena {index + 1}
            </span>
            {scene.title && (
              <span className={cn("text-sm text-muted-foreground", collapsed && "text-foreground font-medium")}>
                {scene.title}
              </span>
            )}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive shrink-0"
          aria-label="Excluir cena"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3">
          <div className="space-y-1.5">
            <Label>Título da cena</Label>
            <Input
              value={scene.title ?? ""}
              onChange={(e) => onUpdate(index, { title: e.target.value || null })}
              placeholder="Título da cena"
            />
          </div>

          <div className="space-y-1.5">
            <Label>O que acontece</Label>
            <AutoGrowTextarea
              rows={3}
              value={scene.description ?? ""}
              onChange={(v) =>
                onUpdate(index, { description: v || null })
              }
              placeholder="O que acontece"
            />
          </div>

          <TagInput
            label="Equipamento"
            placeholder="Adicionar equipamento…"
            values={scene.equipment}
            onChange={(equipment) => onUpdate(index, { equipment })}
          />

          <TagInput
            label="Materiais"
            placeholder="Adicionar material…"
            values={scene.materials}
            onChange={(materials) => onUpdate(index, { materials })}
          />

          <div className="space-y-1.5">
            <Label>Cenário</Label>
            <Input
              value={scene.scenery ?? ""}
              onChange={(e) => onUpdate(index, { scenery: e.target.value || null })}
              placeholder="Cenário"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function SceneEditor({ scenes, onChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor));

  // Ids estáveis por cena (apenas no cliente, não persistidos). Usar o índice
  // como key/id do dnd fazia o estado local (cena colapsada, rascunho de tag)
  // "embaralhar" entre as linhas ao reordenar por arraste.
  const idsRef = useRef<string[]>([]);
  if (idsRef.current.length !== scenes.length) {
    idsRef.current = scenes.map((_, i) => idsRef.current[i] ?? crypto.randomUUID());
  }
  const ids = idsRef.current;

  function update(index: number, patch: Partial<ContentSceneInput>) {
    onChange(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function remove(index: number) {
    idsRef.current = ids.filter((_, i) => i !== index);
    onChange(scenes.filter((_, i) => i !== index));
  }

  function add() {
    idsRef.current = [...ids, crypto.randomUUID()];
    onChange([...scenes, { ...EMPTY_SCENE }]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    idsRef.current = arrayMove(ids, from, to);
    onChange(arrayMove(scenes, from, to));
  }

  return (
    <div className="space-y-2">
      {scenes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma cena. Divida o roteiro em cenas com equipamento, materiais e
          cenário.
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {scenes.map((scene, i) => (
            <SceneRow
              key={ids[i]}
              id={ids[i]}
              scene={scene}
              index={i}
              onUpdate={update}
              onRemove={remove}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        Adicionar cena
      </Button>
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (!values.includes(t)) onChange([...values, t]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== t))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
        }}
        placeholder={placeholder}
        className="h-8"
      />
    </div>
  );
}
