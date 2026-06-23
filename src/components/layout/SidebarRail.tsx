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
  effectiveGroupLabel,
  loadGroupLabels,
  loadOrderedNav,
  NAV_GROUP_ORDER,
  NAV_ORDER_CHANGED,
  type GroupLabels,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";

/**
 * Menu lateral COMPACTO (experimental, opt-in). Só ícones num círculo; o rótulo
 * aparece num tooltip ao passar o mouse; os grupos ficam separados verticalmente
 * por divisores. Reaproveita a MESMA configuração de navegação do menu clássico
 * (ordem e grupos customizados), então as duas visões ficam sempre em sincronia.
 */
export function SidebarRail({ onNavigate }: { onNavigate?: () => void }) {
  const setSidebarLayout = useThemeStore((s) => s.setSidebarLayout);
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  const [groupLabels, setGroupLabels] = useState<GroupLabels>({});

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

  const fixedHead = nav.filter((i) => i.fixed && i.to === "/");

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Tooltip key={item.to} delayDuration={150}>
        <TooltipTrigger asChild>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                isActive
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <aside className="flex h-screen w-[4.25rem] flex-col border-r bg-card">
        {/* Marca compacta */}
        <div className="flex h-16 items-center justify-center border-b">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
            V
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-3">
          {fixedHead.map(renderItem)}

          {NAV_GROUP_ORDER.map((group: NavGroup) => {
            const items = nav.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="flex flex-col items-center gap-1">
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <div className="my-1 h-px w-6 bg-border" role="separator" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {effectiveGroupLabel(group, groupLabels)}
                  </TooltipContent>
                </Tooltip>
                {items.map(renderItem)}
              </div>
            );
          })}
        </nav>

        {/* Voltar ao menu clássico */}
        <div className="flex items-center justify-center border-t p-2">
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSidebarLayout("classic")}
                aria-label="Menu expandido"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Menu expandido</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
