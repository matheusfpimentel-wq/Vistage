import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useThemeStore } from "@/lib/theme";
import {
  DEFAULT_NAV,
  loadOrderedNav,
  NAV_GROUP_ORDER,
  NAV_ORDER_CHANGED,
  type NavItem,
} from "@/lib/nav";

/**
 * Menu lateral COMPACTO (experimental, opt-in): NÃO é uma barra — são círculos
 * "suspensos" sobre o fundo do app, centralizados na vertical. Cada ícone fica
 * centralizado no seu círculo e CRESCE no hover (estilo dock do macOS); o nome
 * aparece num tooltip ao lado. Reaproveita a mesma config de navegação do menu
 * clássico (ordem + grupos), então as duas visões ficam sempre em sincronia.
 */
export function SidebarRail({ onNavigate }: { onNavigate?: () => void }) {
  const setSidebarLayout = useThemeStore((s) => s.setSidebarLayout);
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);

  const reload = useCallback(() => {
    void loadOrderedNav().then(setNav);
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(NAV_ORDER_CHANGED, reload);
    return () => window.removeEventListener(NAV_ORDER_CHANGED, reload);
  }, [reload]);

  const fixedHead = nav.filter((i) => i.fixed && i.to === "/");
  const groups = NAV_GROUP_ORDER.map((g) => ({
    group: g,
    items: nav.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  const circle = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Tooltip key={item.to} delayDuration={120}>
        <TooltipTrigger asChild>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition-transform duration-150 ease-out hover:z-10 hover:scale-[1.35] hover:shadow-lg",
                isActive
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )
            }
          >
            <Icon className="block h-[1.15rem] w-[1.15rem] shrink-0" />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={120}>
      {/* Coluna transparente (sem barra): rola se não couber, centraliza se couber. */}
      <div className="flex h-screen w-[4.5rem] shrink-0 flex-col items-center overflow-y-auto">
        <div className="my-auto flex flex-col items-center gap-2 py-3">
          {fixedHead.map(circle)}
          {groups.map(({ group, items }) => (
            <div key={group} className="mt-2 flex flex-col items-center gap-2">
              {items.map(circle)}
            </div>
          ))}
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSidebarLayout("classic")}
                aria-label="Voltar ao menu expandido"
                className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-transform duration-150 ease-out hover:scale-125 hover:text-foreground"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Menu expandido</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
