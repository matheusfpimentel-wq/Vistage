import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
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
  Scale,
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
  { to: "/decisoes", label: "Decision Log", icon: Scale },
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
  // active só vira true depois de passar do threshold, pra distinguir clique
  // (navegar) de arraste. moved marca que houve arraste, pra suprimir o clique.
  const dragState = useRef<{
    startY: number;
    idx: number;
    active: boolean;
    moved: boolean;
  } | null>(null);
  const DRAG_THRESHOLD = 5;
  // marca que o último gesto foi arraste, pra suprimir o clique que vem logo após
  const justDragged = useRef(false);

  useEffect(() => {
    loadOrder().then((order) => {
      if (order) setNav(applyOrder(DEFAULT_NAV, order));
    });
  }, []);

  const persistOrder = useCallback((items: NavItem[]) => {
    const order = items.filter((i) => !i.fixed).map((i) => i.to);
    void saveOrder(order);
  }, []);

  // Calcula o índice dentro dos reordenáveis a partir do índice global.
  function reorderableIdx(navIdx: number, items: NavItem[]): number {
    const reorderable = items.filter((i) => !i.fixed);
    return reorderable.findIndex((item) => items.indexOf(item) === navIdx);
  }

  function onRowPointerDown(e: React.PointerEvent, navIdx: number, fixed?: boolean) {
    if (fixed) return;
    // Só botão esquerdo / toque. Não captura ainda nem preventDefault: deixa o
    // clique normal acontecer caso não passe do threshold (navegação).
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragState.current = { startY: e.clientY, idx: navIdx, active: false, moved: false };
  }

  function onRowPointerMove(e: React.PointerEvent) {
    const st = dragState.current;
    if (!st) return;
    const dy = e.clientY - st.startY;
    if (!st.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      // passou do threshold → vira arraste de verdade
      st.active = true;
      st.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDraggingIdx(st.idx);
      setOverIdx(st.idx);
    }
    const steps = Math.round(dy / ITEM_HEIGHT);
    const srcNavIdx = st.idx;
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

  function onRowPointerUp(e: React.PointerEvent) {
    const st = dragState.current;
    if (!st) return;
    if (!st.active) {
      // foi só um clique: deixa o NavLink navegar
      dragState.current = null;
      justDragged.current = false;
      return;
    }
    justDragged.current = true;
    const dy = e.clientY - st.startY;
    const steps = Math.round(dy / ITEM_HEIGHT);
    const srcNavIdx = st.idx;
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
        {/* Logo Vistage — mesmo ícone do app */}
        <div className="relative h-8 w-8 shrink-0">
          <svg
            viewBox="0 0 512 512"
            className="h-8 w-8 rounded-lg shadow-lg shadow-primary/40"
            aria-hidden
          >
            <circle cx="256" cy="256" r="256" fill="#1A0D2E" />
            <circle cx="256" cy="256" r="218" fill="none" stroke="#7C3AED" strokeWidth="18" />
            <circle cx="256" cy="256" r="158" fill="none" stroke="#7C3AED" strokeWidth="18" />
            <circle cx="256" cy="256" r="98" fill="none" stroke="#7C3AED" strokeWidth="18" />
            <circle cx="256" cy="256" r="34" fill="#7C3AED" />
            <path
              d="M 136 106 Q 192 168, 256 274 Q 320 168, 376 106 C 368 98, 358 98, 350 105 C 318 144, 274 228, 256 246 C 238 228, 194 144, 162 105 C 154 98, 144 98, 136 106 Z"
              fill="#C4B5FD"
            />
          </svg>
          {/* dot — virtual backstage "on-air" indicator */}
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card bg-emerald-400 shadow-sm"
          />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight tracking-wide bg-gradient-to-r from-violet-400 via-primary to-fuchsia-400 bg-clip-text text-transparent">
            Vistage
          </div>
          <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60 leading-tight">
            Virtual Backstage
          </div>
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
                !fixed && "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-50 scale-95",
                isOver && "border-t-2 border-primary"
              )}
              onPointerDown={(e) => onRowPointerDown(e, idx, fixed)}
              onPointerMove={onRowPointerMove}
              onPointerUp={onRowPointerUp}
              onPointerCancel={onRowPointerUp}
            >
              <NavLink
                to={to}
                end={end}
                // se acabamos de arrastar, suprime a navegação do clique
                onClick={(e) => {
                  if (justDragged.current) {
                    e.preventDefault();
                    justDragged.current = false;
                  }
                }}
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
                <div
                  className={cn(
                    "mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded transition",
                    draggingIdx === idx
                      ? "opacity-60"
                      : "opacity-0 group-hover/row:opacity-100"
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
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
