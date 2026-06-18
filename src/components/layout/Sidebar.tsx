import { Fragment, useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ArrowUpDown, Check, ChevronDown, ChevronRight, GripVertical, PanelLeftClose } from "lucide-react";
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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  DEFAULT_NAV,
  NAV_GROUP_META,
  NAV_GROUP_ORDER,
  NAV_ORDER_CHANGED,
  effectiveGroupLabel,
  loadGroupLabels,
  loadOrderedNav,
  saveItemGroups,
  saveNavOrder,
  type GroupLabels,
  type ItemGroups,
  type NavItem,
} from "@/lib/nav";

// Item arrastável — usado só no modo de reordenação. A linha inteira é a alça.
function SortableNavItem({ item }: { item: NavItem }) {
  const { to, label, icon: Icon } = item;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: to });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "mb-1 flex touch-none items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm",
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{label}</span>
    </div>
  );
}

export function Sidebar({
  onCollapse,
  onNavigate,
}: {
  onCollapse?: () => void;
  /** Chamado ao clicar num item — usado para fechar o drawer no mobile. */
  onNavigate?: () => void;
}) {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  const [groupLabels, setGroupLabels] = useState<GroupLabels>({});
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("sidebar_collapsed_groups") ?? "{}");
    } catch {
      return {};
    }
  });

  const sensors = useSensors(useSensor(PointerSensor));

  const reload = useCallback(() => {
    void Promise.all([loadOrderedNav(), loadGroupLabels()]).then(([ordered, labels]) => {
      setNav(ordered);
      setGroupLabels(labels);
    });
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener(NAV_ORDER_CHANGED, onChange);
    return () => window.removeEventListener(NAV_ORDER_CHANGED, onChange);
  }, [reload]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      localStorage.setItem("sidebar_collapsed_groups", JSON.stringify(next));
      return next;
    });
  }, []);

  const reorderable = nav.filter((i) => !i.fixed);
  // Lista achatada com os grupos contíguos (na ordem dos grupos) — é a base do
  // sortable único: assim dá pra arrastar suave dentro do grupo E entre grupos.
  const orderedReorderable = NAV_GROUP_ORDER.flatMap((g) =>
    reorderable.filter((i) => i.group === g)
  );
  const activeItem = activeId ? reorderable.find((i) => i.to === activeId) ?? null : null;

  async function persist(nextReorderable: NavItem[], nextItemGroups: ItemGroups) {
    const head = nav.filter((i) => i.fixed && i.to === "/");
    const tail = nav.filter((i) => i.fixed && i.to !== "/");
    setNav([...head, ...nextReorderable, ...tail]);
    await Promise.all([
      saveNavOrder(nextReorderable.map((i) => i.to)),
      saveItemGroups(nextItemGroups),
    ]);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const flat = orderedReorderable;
    const fromIdx = flat.findIndex((i) => i.to === String(active.id));
    const toIdx = flat.findIndex((i) => i.to === String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;

    const next = arrayMove(flat, fromIdx, toIdx);
    // O item movido adota o grupo do vizinho na nova posição (move entre grupos).
    const moved = next[toIdx];
    const neighbor = next[toIdx - 1] ?? next[toIdx + 1];
    if (neighbor?.group && moved.group !== neighbor.group) {
      next[toIdx] = { ...moved, group: neighbor.group };
    }
    // Recalcula os overrides de grupo a partir do estado final.
    const def = new Map(DEFAULT_NAV.map((i) => [i.to, i.group]));
    const newItemGroups: ItemGroups = {};
    for (const it of next) {
      if (it.group && def.get(it.to) !== it.group) newItemGroups[it.to] = it.group;
    }
    void persist(next, newItemGroups);
  }

  const renderLink = ({ to, label, icon: Icon, end }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors select-none",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div>
          <div className="text-lg font-semibold leading-tight tracking-tight bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] bg-clip-text text-transparent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Vistage
          </div>
          <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60 leading-tight">
            Virtual Backstage
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {editing ? (
          // Modo de reordenação: arraste os itens (inclusive entre grupos).
          <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedReorderable.map((i) => i.to)}
              strategy={verticalListSortingStrategy}
            >
              {orderedReorderable.map((item, idx) => {
                const prev = orderedReorderable[idx - 1];
                const showHeader = !prev || prev.group !== item.group;
                return (
                  <Fragment key={item.to}>
                    {showHeader && item.group && (
                      <div className="mb-1 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        {effectiveGroupLabel(item.group, groupLabels)}
                      </div>
                    )}
                    <SortableNavItem item={item} />
                  </Fragment>
                );
              })}
            </SortableContext>
            <DragOverlay>
              {activeItem ? (
                <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm shadow-lg ring-1 ring-primary/40">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <activeItem.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{activeItem.label}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <>
            {/* Itens fixos no topo (Dashboard) — fora dos grupos. */}
            <div className="space-y-0.5">
              {nav.filter((i) => i.fixed && i.to !== "/configuracoes").map(renderLink)}
            </div>

            {/* Grupos temáticos — o cabeçalho leva à dash própria do grupo;
                o chevron recolhe/expande a seção (estado lembrado). */}
            {NAV_GROUP_ORDER.map((group) => {
              const items = nav.filter((i) => i.group === group);
              if (items.length === 0) return null;
              const meta = NAV_GROUP_META[group];
              const isCollapsed = collapsed[group];
              return (
                <div key={group} className="mt-4 space-y-0.5">
                  <div className="flex items-center">
                    <NavLink
                      to={meta.to}
                      end
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "group/header flex flex-1 items-center gap-1 rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground/50 hover:text-foreground"
                        )
                      }
                      title={`Abrir dashboard de ${effectiveGroupLabel(group, groupLabels)}`}
                    >
                      {effectiveGroupLabel(group, groupLabels)}
                      <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover/header:opacity-100" />
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 transition hover:bg-accent hover:text-foreground"
                      aria-label={isCollapsed ? `Expandir ${effectiveGroupLabel(group, groupLabels)}` : `Recolher ${effectiveGroupLabel(group, groupLabels)}`}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          isCollapsed && "-rotate-90"
                        )}
                      />
                    </button>
                  </div>
                  {!isCollapsed && items.map(renderLink)}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t p-2 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition",
            editing
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          title={editing ? "Concluir reordenação" : "Reordenar o menu (arrastar)"}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
          {editing ? "Concluir" : "Reordenar"}
        </button>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Recolher painel lateral"
            aria-label="Recolher painel lateral"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
