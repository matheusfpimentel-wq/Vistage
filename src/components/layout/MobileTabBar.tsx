import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { CheckSquare, Search, Sparkles, Sun, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "@/modules/revisao/api";
import { computeAlerts } from "@/modules/revisao/alerts";
import { getDisabledRuleIds } from "@/modules/revisao/ruleConfig";
import { triggerSearch } from "@/lib/shortcuts";
import { DATA_CHANGED } from "@/lib/events";

/**
 * Barra de navegação inferior — só aparece em telas pequenas (mobile).
 * Os MODOS do celular: Hoje | Foco | Brainstorm | Pesquisa | Tarefas.
 * Captura rápida é um botão flutuante no header; o menu completo de módulos
 * abre pelo hambúrguer do header.
 */
const TABS = [
  { to: "/", label: "Hoje", icon: Sun, end: true, badge: true },
  { to: "/foco", label: "Foco", icon: Target, end: false },
  { to: "/brainstorm", label: "Brainstorm", icon: Sparkles, end: false },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare, end: false },
];

export function MobileTabBar() {
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

  const itemCls = (active: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
      active ? "text-primary" : "text-muted-foreground"
    );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-card/95 backdrop-blur md:hidden">
      {/* Hoje | Foco | Brainstorm (3 primeiros) */}
      {TABS.slice(0, 3).map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => itemCls(isActive)}>
          <span className="relative">
            <Icon className="h-5 w-5" />
            {badge && criticalCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
                {criticalCount}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
      {/* Pesquisa — abre a busca global (não é rota). */}
      <button type="button" onClick={triggerSearch} className={itemCls(false)}>
        <Search className="h-5 w-5" />
        Pesquisa
      </button>
      {/* Tarefas */}
      <NavLink to="/tarefas" className={({ isActive }) => itemCls(isActive)}>
        <CheckSquare className="h-5 w-5" />
        Tarefas
      </NavLink>
    </nav>
  );
}
