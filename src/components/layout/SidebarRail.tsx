import { useCallback, useEffect, useRef, useState } from "react";
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

// Parâmetros da magnificação estilo dock do macOS.
const RANGE = 110; // px de influência do cursor (acima/abaixo)
const MAX_BOOST = 0.55; // escala extra no ícone sob o cursor (1 + 0.55 = 1.55×)

/**
 * Menu lateral COMPACTO (experimental, opt-in): círculos "suspensos" sobre o
 * fundo do app (sem barra), centralizados na vertical. Ao aproximar o mouse, os
 * ícones CRESCEM com falloff suave — o sob o cursor mais, os vizinhos um pouco
 * menos — igual ao dock do macOS. Reaproveita a mesma config de navegação do
 * menu clássico (ordem + grupos).
 */
export function SidebarRail({ onNavigate }: { onNavigate?: () => void }) {
  const setSidebarLayout = useThemeStore((s) => s.setSidebarLayout);
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const reload = useCallback(() => {
    void loadOrderedNav().then(setNav);
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(NAV_ORDER_CHANGED, reload);
    return () => window.removeEventListener(NAV_ORDER_CHANGED, reload);
  }, [reload]);

  // Lista achatada (Dashboard + grupos), marcando o 1º item de cada grupo pra
  // dar o respiro vertical sem virar uma barra.
  const fixedHead = nav.filter((i) => i.fixed && i.to === "/");
  const flat: { item: NavItem; groupStart: boolean }[] = [];
  fixedHead.forEach((item) => flat.push({ item, groupStart: false }));
  NAV_GROUP_ORDER.forEach((g) => {
    nav
      .filter((i) => i.group === g)
      .forEach((item, idx) => flat.push({ item, groupStart: idx === 0 }));
  });

  function magnify(cursorY: number) {
    for (const el of itemRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const d = Math.abs(cursorY - center);
      const f = Math.max(0, 1 - d / RANGE);
      const scale = 1 + MAX_BOOST * f * f; // ease-out na curva
      el.style.transform = `scale(${scale})`;
    }
  }
  function reset() {
    for (const el of itemRefs.current) {
      if (el) el.style.transform = "scale(1)";
    }
  }

  return (
    <TooltipProvider delayDuration={120}>
      {/* Coluna transparente (sem barra). Rola se não couber; centraliza se couber. */}
      <div className="flex h-screen w-[4.5rem] shrink-0 flex-col items-center overflow-y-auto">
        <div
          className="my-auto flex flex-col items-center gap-2 py-3"
          onMouseMove={(e) => magnify(e.clientY)}
          onMouseLeave={reset}
        >
          {flat.map(({ item, groupStart }, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.to}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className={cn(
                  "transition-transform duration-100 ease-out will-change-transform",
                  groupStart && "mt-2"
                )}
                style={{ transformOrigin: "left center" }}
              >
                <Tooltip delayDuration={120}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "relative inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm",
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
              </div>
            );
          })}

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
