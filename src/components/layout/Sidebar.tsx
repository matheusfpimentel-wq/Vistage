import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, ChevronRight, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_NAV,
  NAV_GROUP_META,
  NAV_GROUP_ORDER,
  NAV_ORDER_CHANGED,
  loadOrderedNav,
  type NavItem,
} from "@/lib/nav";

export function Sidebar({
  onCollapse,
  onNavigate,
}: {
  onCollapse?: () => void;
  /** Chamado ao clicar num item — usado para fechar o drawer no mobile. */
  onNavigate?: () => void;
}) {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("sidebar_collapsed_groups") ?? "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    void loadOrderedNav().then(setNav);
    // Recarrega quando a ordem é alterada na tela de Configurações.
    const onChange = () => void loadOrderedNav().then(setNav);
    window.addEventListener(NAV_ORDER_CHANGED, onChange);
    return () => window.removeEventListener(NAV_ORDER_CHANGED, onChange);
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      localStorage.setItem("sidebar_collapsed_groups", JSON.stringify(next));
      return next;
    });
  }, []);

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
            ? "bg-accent text-accent-foreground font-medium"
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
          <div className="text-lg font-semibold leading-tight tracking-tight bg-gradient-to-r from-violet-400 via-primary to-fuchsia-400 bg-clip-text text-transparent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Vistage
          </div>
          <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60 leading-tight">
            Virtual Backstage
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {/* Itens fixos no topo (Dashboard, Alertas) — fora dos grupos. */}
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
                  title={`Abrir dashboard de ${group}`}
                >
                  {group}
                  <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover/header:opacity-100" />
                </NavLink>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 transition hover:bg-accent hover:text-foreground"
                  aria-label={isCollapsed ? `Expandir ${group}` : `Recolher ${group}`}
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

        {/* Configurações fixo no fim. */}
        <div className="mt-4 space-y-0.5 border-t pt-3">
          {nav.filter((i) => i.to === "/configuracoes").map(renderLink)}
        </div>
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
