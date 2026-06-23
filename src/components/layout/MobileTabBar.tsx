import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Bell, CalendarRange, CheckSquare, LayoutDashboard, Menu, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "@/modules/revisao/api";
import { computeAlerts } from "@/modules/revisao/alerts";
import { getDisabledRuleIds } from "@/modules/revisao/ruleConfig";
import { DATA_CHANGED } from "@/lib/events";

/**
 * Barra de navegação inferior — só aparece em telas pequenas (mobile).
 * Concentra os destinos mais usados; o botão "Menu" abre o drawer completo
 * com todos os módulos.
 */
const TABS = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/alertas", label: "Alertas", icon: Bell, end: false },
  { to: "/gigs", label: "GIGs", icon: CalendarRange, end: false },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare, end: false },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, end: false },
];

export function MobileTabBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [criticalCount, setCriticalCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const stats = await loadWeekStats();
          setCriticalCount(computeAlerts(stats, undefined, getDisabledRuleIds()).filter((a) => a.critical).length);
        } catch {
          /* ignore */
        }
      }, 500);
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    window.addEventListener(DATA_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener(DATA_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-card/95 backdrop-blur md:hidden">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )
          }
        >
          <span className="relative">
            <Icon className="h-5 w-5" />
            {to === "/alertas" && criticalCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
                {criticalCount}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
      >
        <Menu className="h-5 w-5" />
        Menu
      </button>
    </nav>
  );
}
