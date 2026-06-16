import { useEffect, useRef, useState } from "react";
import { GripVertical, Pencil, RotateCcw, X } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  DEFAULT_NAV,
  NAV_GROUP_ORDER,
  effectiveGroupLabel,
  loadGroupLabels,
  loadOrderedNav,
  saveGroupLabels,
  saveItemGroups,
  saveNavOrder,
  type GroupLabels,
  type ItemGroups,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";

// ============================================================
// Item row (sortable)
// ============================================================

function NavRow({ item, overlay }: { item: NavItem; overlay?: boolean }) {
  const { to, label, icon: Icon } = item;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: to });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition",
        isDragging && !overlay && "opacity-30",
        overlay && "shadow-lg ring-1 ring-primary/40"
      )}
    >
      <div
        className="flex cursor-grab touch-none items-center text-muted-foreground/60 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 shrink-0" />
      </div>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm">{label}</span>
    </li>
  );
}

// ============================================================
// Group header with inline rename
// ============================================================

function GroupHeader({
  group,
  labels,
  onSave,
}: {
  group: NavGroup;
  labels: GroupLabels;
  onSave: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const display = effectiveGroupLabel(group, labels);

  function startEdit() {
    setDraft(display);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== display) onSave(trimmed);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          onBlur={commit}
          className="flex-1 rounded border bg-background px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
        <button
          type="button"
          onClick={cancel}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="group/header flex items-center gap-1 px-1">
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {display}
      </span>
      <button
        type="button"
        onClick={startEdit}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 opacity-0 transition hover:text-muted-foreground group-hover/header:opacity-100"
        title="Renomear grupo"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function MenuOrderSettings() {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  const [labels, setLabels] = useState<GroupLabels>({});
  const [itemGroups, setItemGroups] = useState<ItemGroups>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    void Promise.all([loadOrderedNav(), loadGroupLabels()]).then(
      ([ordered, groupLabels]) => {
        setNav(ordered);
        setLabels(groupLabels);
      }
    );
  }, []);

  const reorderable = nav.filter((i) => !i.fixed);
  const activeItem = activeId ? reorderable.find((i) => i.to === activeId) : null;

  // Persist order + item group overrides together
  async function persistAll(nextItems: NavItem[], nextItemGroups: ItemGroups) {
    const head = nav.filter((i) => i.fixed && i.to === "/");
    const tail = nav.filter((i) => i.fixed && i.to !== "/");
    const next = [...head, ...nextItems, ...tail];
    setNav(next);
    setItemGroups(nextItemGroups);
    await Promise.all([
      saveNavOrder(nextItems.map((i) => i.to)),
      saveItemGroups(nextItemGroups),
    ]);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeItem = reorderable.find((i) => i.to === activeId);
    const overItem = reorderable.find((i) => i.to === overId);
    if (!activeItem || !overItem || !activeItem.group || !overItem.group) return;

    const activeGroup = activeItem.group;
    const overGroup = overItem.group;

    // Build updated item list
    const next = [...reorderable];
    const fromIdx = next.findIndex((i) => i.to === activeId);

    const newItemGroups = { ...itemGroups };

    if (activeGroup !== overGroup) {
      // Cross-group move: update item's group
      next[fromIdx] = { ...next[fromIdx], group: overGroup };
      if (overGroup !== activeItem.group) {
        // Only store override if different from DEFAULT_NAV
        const defaultGroup = DEFAULT_NAV.find((i) => i.to === activeId)?.group;
        if (overGroup !== defaultGroup) {
          newItemGroups[activeId] = overGroup;
        } else {
          delete newItemGroups[activeId];
        }
      }
    }

    // Reposition
    const [moved] = next.splice(fromIdx, 1);
    const newToIdx = next.findIndex((i) => i.to === overId);
    next.splice(newToIdx, 0, moved);

    void persistAll(next, newItemGroups);
  }

  async function renameGroup(group: NavGroup, newLabel: string) {
    const next = { ...labels, [group]: newLabel };
    setLabels(next);
    await saveGroupLabels(next);
    toast.success(`Grupo renomeado para "${newLabel}"`);
  }

  async function reset() {
    setNav(DEFAULT_NAV);
    setLabels({});
    setItemGroups({});
    await Promise.all([
      saveNavOrder(DEFAULT_NAV.filter((i) => !i.fixed).map((i) => i.to)),
      saveGroupLabels({}),
      saveItemGroups({}),
    ]);
    toast.success("Menu restaurado ao padrão");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ordem do menu lateral</CardTitle>
            <CardDescription>
              Arraste pela alça para reordenar ou mover módulos entre grupos.
              Clique no ícone de lápis para renomear um grupo.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {NAV_GROUP_ORDER.map((group) => {
            const groupItems = reorderable.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                <GroupHeader
                  group={group}
                  labels={labels}
                  onSave={(label) => void renameGroup(group, label)}
                />
                <SortableContext
                  items={groupItems.map((i) => i.to)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-1">
                    {groupItems.map((item) => (
                      <NavRow key={item.to} item={item} />
                    ))}
                  </ul>
                </SortableContext>
              </div>
            );
          })}

          <DragOverlay>
            {activeItem ? (
              <ul>
                <NavRow item={activeItem} overlay />
              </ul>
            ) : null}
          </DragOverlay>
        </DndContext>
      </CardContent>
    </Card>
  );
}
