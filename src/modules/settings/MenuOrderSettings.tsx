import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
  loadOrderedNav,
  saveNavOrder,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";

type NavRowProps = {
  item: NavItem;
  isFirst: boolean;
  isLast: boolean;
  onMove: (to: string, dir: -1 | 1) => void;
  group: NavGroup;
};

function NavRow({ item, isFirst, isLast, onMove }: NavRowProps) {
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
        isDragging && "opacity-50"
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
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={isFirst}
          onClick={() => onMove(to, -1)}
          aria-label={`Mover ${label} para cima`}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={isLast}
          onClick={() => onMove(to, 1)}
          aria-label={`Mover ${label} para baixo`}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function MenuOrderSettings() {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    void loadOrderedNav().then(setNav);
  }, []);

  // Só os itens reordenáveis (Dashboard e Configurações são fixos).
  const reorderable = nav.filter((i) => !i.fixed);

  async function persist(nextReorderable: NavItem[]) {
    const head = nav.filter((i) => i.fixed && i.to === "/");
    const tail = nav.filter((i) => i.fixed && i.to !== "/");
    const next = [...head, ...nextReorderable, ...tail];
    setNav(next);
    await saveNavOrder(nextReorderable.map((i) => i.to));
  }

  /** Reconstrói o flat list a partir da nova ordem interna de um grupo. */
  function persistGroup(group: NavGroup, reordered: NavItem[]) {
    const next = NAV_GROUP_ORDER.flatMap((g) =>
      g === group ? reordered : reorderable.filter((i) => i.group === g)
    );
    void persist(next);
  }

  /** Move um item uma posição (setas). */
  function move(group: NavGroup, to: string, dir: -1 | 1) {
    const groupItems = reorderable.filter((i) => i.group === group);
    const idx = groupItems.findIndex((i) => i.to === to);
    const target = idx + dir;
    if (target < 0 || target >= groupItems.length) return;
    const reordered = [...groupItems];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    persistGroup(group, reordered);
  }

  /** Reposiciona via drag-and-drop (dentro do mesmo grupo). */
  function reorder(group: NavGroup, fromTo: string, toTo: string) {
    if (fromTo === toTo) return;
    const groupItems = reorderable.filter((i) => i.group === group);
    const from = groupItems.findIndex((i) => i.to === fromTo);
    const to = groupItems.findIndex((i) => i.to === toTo);
    if (from < 0 || to < 0) return;
    const reordered = [...groupItems];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    persistGroup(group, reordered);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    // Find which group the active item belongs to
    const activeItem = reorderable.find((i) => i.to === activeId);
    if (!activeItem) return;
    reorder(activeItem.group, activeId, overId);
  }

  async function reset() {
    setNav(DEFAULT_NAV);
    await saveNavOrder(DEFAULT_NAV.filter((i) => !i.fixed).map((i) => i.to));
    toast.success("Ordem do menu restaurada");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ordem do menu lateral</CardTitle>
            <CardDescription>
              Arraste pela alça ou use as setas para reordenar os módulos dentro
              de cada grupo. Dashboard fica sempre no topo e Configurações no fim.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {NAV_GROUP_ORDER.map((group) => {
            const groupItems = reorderable.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                <SortableContext
                  items={groupItems.map((i) => i.to)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-1">
                    {groupItems.map((item, i) => (
                      <NavRow
                        key={item.to}
                        item={item}
                        group={group}
                        isFirst={i === 0}
                        isLast={i === groupItems.length - 1}
                        onMove={(to, dir) => move(group, to, dir)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </div>
            );
          })}
        </DndContext>
      </CardContent>
    </Card>
  );
}
