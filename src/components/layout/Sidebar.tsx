import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BookOpen,
  Building2,
  CalendarRange,
  CheckSquare,
  Film,
  GraduationCap,
  GripVertical,
  Heart,
  LayoutDashboard,
  Lightbulb,
  Music,
  PartyPopper,
  Settings,
  Sparkles,
  Store,
  Target,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db";

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  fixed?: boolean;
};

const DEFAULT_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, fixed: true },
  { to: "/gigs", label: "GIGs", icon: CalendarRange },
  { to: "/venues", label: "Venues", icon: Building2 },
  { to: "/crm", label: "CRM", icon: Users },
  { to: "/fornecedores", label: "Fornecedores", icon: Store },
  { to: "/fas", label: "Clube de fãs", icon: Heart },
  { to: "/aulas", label: "Aulas", icon: GraduationCap },
  { to: "/musica", label: "Produção Musical", icon: Music },
  { to: "/festas", label: "Produção de Festas", icon: PartyPopper },
  { to: "/conteudo", label: "Conteúdo", icon: Film },
  { to: "/ideias", label: "Ideias & Insights", icon: Lightbulb },
  { to: "/foco", label: "Energia & Foco", icon: Zap },
  { to: "/objetivos", label: "OKRs", icon: Target },
  { to: "/decisoes", label: "Decision Log", icon: BookOpen },
  { to: "/identidade", label: "Identidade", icon: Sparkles },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/configuracoes", label: "Configurações", icon: Settings, fixed: true },
];

const SETTINGS_KEY = "sidebar_order";

async function loadOrder(): Promise<string[] | null> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_KEY]
    );
    if (!rows[0]) return null;
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveOrder(order: string[]): Promise<void> {
  try {
    const db = getDb();
    await db.execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [SETTINGS_KEY, JSON.stringify(order)]
    );
  } catch {
    // non-critical
  }
}

function applyOrder(items: NavItem[], order: string[]): NavItem[] {
  const map = new Map(items.map((i) => [i.to, i]));
  const fixed_head = items.filter((i) => i.fixed && i.to === "/");
  const fixed_tail = items.filter((i) => i.fixed && i.to !== "/");
  const reorderable = order
    .map((to) => map.get(to))
    .filter((i): i is NavItem => !!i && !i.fixed);
  const missing = items.filter((i) => !i.fixed && !order.includes(i.to));
  return [...fixed_head, ...reorderable, ...missing, ...fixed_tail];
}

const ITEM_HEIGHT = 36; // approximate height of each nav item in px

export function Sidebar() {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // pointer drag state
  const dragState = useRef<{
    startY: number;
    currentY: number;
    idx: number;
  } | null>(null);

  useEffect(() => {
    loadOrder().then((order) => {
      if (order) setNav(applyOrder(DEFAULT_NAV, order));
    });
  }, []);

  const persistOrder = useCallback((items: NavItem[]) => {
    const order = items.filter((i) => !i.fixed).map((i) => i.to);
    void saveOrder(order);
  }, []);

  function reorderableIdx(navIdx: number, items: NavItem[]): number {
    return items.filter((i) => !i.fixed).findIndex(
      (_, ri) => items.indexOf(items.filter((i2) => !i2.fixed)[ri]) === navIdx
    );
  }

  function onGripPointerDown(e: React.PointerEvent, navIdx: number) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, currentY: e.clientY, idx: navIdx };
    setDraggingIdx(navIdx);
    setOverIdx(navIdx);
  }

  function onGripPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    dragState.current.currentY = e.clientY;
    const dy = e.clientY - dragState.current.startY;
    const steps = Math.round(dy / ITEM_HEIGHT);
    const srcNavIdx = dragState.current.idx;

    setNav((prev) => {
      const reorderable = prev.filter((i) => !i.fixed);
      const srcReIdx = reorderableIdx(srcNavIdx, prev);
      if (srcReIdx < 0) return prev;
      const targetReIdx = Math.max(0, Math.min(reorderable.length - 1, srcReIdx + steps));
      const targetNavIdx = prev.indexOf(reorderable[targetReIdx]);
      setOverIdx(targetNavIdx);
      return prev;
    });
  }

  function onGripPointerUp(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dy = e.clientY - dragState.current.startY;
    const steps = Math.round(dy / ITEM_HEIGHT);
    const srcNavIdx = dragState.current.idx;
    dragState.current = null;

    setNav((prev) => {
      const reorderable = prev.filter((i) => !i.fixed);
      const srcReIdx = reorderableIdx(srcNavIdx, prev);
      if (srcReIdx < 0) return prev;
      const targetReIdx = Math.max(0, Math.min(reorderable.length - 1, srcReIdx + steps));
      if (srcReIdx === targetReIdx) return prev;
      const next = [...reorderable];
      const [moved] = next.splice(srcReIdx, 1);
      next.splice(targetReIdx, 0, moved);
      const fixed_head = prev.filter((i) => i.fixed && i.to === "/");
      const fixed_tail = prev.filter((i) => i.fixed && i.to !== "/");
      const result = [...fixed_head, ...next, ...fixed_tail];
      persistOrder(result);
      return result;
    });

    setDraggingIdx(null);
    setOverIdx(null);
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="bg-primary-gradient relative flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground shadow-md shadow-primary/30">
          <span className="text-base font-black leading-none tracking-tighter">M</span>
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-orange-400 shadow-sm"
          />
        </div>
        <div className="text-primary-gradient font-semibold tracking-tight">
          MusicGest
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-0.5 p-3">
        {nav.map(({ to, label, icon: Icon, end, fixed }, idx) => {
          const isDragging = draggingIdx === idx;
          const isOver = overIdx === idx && draggingIdx !== null && draggingIdx !== idx;
          return (
            <div
              key={to}
              className={cn(
                "group/row flex items-center rounded-md transition-all",
                isDragging && "opacity-50 scale-95",
                isOver && "border-t-2 border-primary"
              )}
            >
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors select-none",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
              {!fixed && (
                <GripVertical
                  className="mr-1 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/30 opacity-0 transition group-hover/row:opacity-100 active:cursor-grabbing"
                  onPointerDown={(e) => onGripPointerDown(e, idx)}
                  onPointerMove={(e) => draggingIdx !== null && onGripPointerMove(e)}
                  onPointerUp={(e) => onGripPointerUp(e)}
                />
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        v0.1.0 · local-first
      </div>
    </aside>
  );
}
