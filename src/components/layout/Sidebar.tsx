import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  CalendarRange,
  CheckSquare,
  Film,
  GraduationCap,
  Heart,
  PanelLeftClose,
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

export function Sidebar({ onCollapse }: { onCollapse?: () => void }) {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  // `to` do item sendo arrastado (null quando não há arraste)
  const [draggingTo, setDraggingTo] = useState<string | null>(null);
  // marca que houve um arraste real, pra suprimir o clique de navegação
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

  function handleDragStart(e: React.DragEvent, item: NavItem) {
    if (item.fixed) {
      e.preventDefault();
      return;
    }
    setDraggingTo(item.to);
    justDragged.current = true;
    e.dataTransfer.effectAllowed = "move";
    // necessário no Firefox pra iniciar o arraste
    e.dataTransfer.setData("text/plain", item.to);
  }

  // Reordena ao vivo conforme o item arrastado passa por cima de outro.
  function handleDragEnter(target: NavItem) {
    if (target.fixed || draggingTo === null || target.to === draggingTo) return;
    setNav((prev) => {
      const fromIdx = prev.findIndex((i) => i.to === draggingTo);
      const toIdx = prev.findIndex((i) => i.to === target.to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    if (draggingTo !== null) {
      setNav((prev) => {
        persistOrder(prev);
        return prev;
      });
    }
    setDraggingTo(null);
    // libera o clique de novo no próximo tick (o click dispara logo após o drop)
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        {/* Logo Vistage — mesmo ícone do app */}
        <div className="relative h-8 w-8 shrink-0">
          <svg
            viewBox="0 0 512 512"
            className="h-8 w-8 rounded-lg"
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
        {nav.map(({ to, label, icon: Icon, end, fixed }) => {
          const isDragging = draggingTo === to;
          return (
            <div
              key={to}
              draggable={!fixed}
              onDragStart={(e) => handleDragStart(e, { to, label, icon: Icon, end, fixed })}
              onDragEnter={() => handleDragEnter({ to, label, icon: Icon, end, fixed })}
              onDragOver={(e) => { if (!fixed) e.preventDefault(); }}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center rounded-md transition-all",
                !fixed && "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-40"
              )}
            >
              <NavLink
                to={to}
                end={end}
                draggable={false}
                onClick={(e) => {
                  if (justDragged.current) e.preventDefault();
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
            </div>
          );
        })}
      </nav>

      {onCollapse && (
        <div className="border-t p-2 flex justify-end">
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Recolher painel lateral"
            aria-label="Recolher painel lateral"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
