import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, ChevronUp, PanelLeftOpen } from "lucide-react";
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

type Row =
  | { kind: "sep" }
  | { kind: "item"; item: NavItem };

/**
 * Menu lateral COMPACTO (modo ícones): tiles de "vidro" suspensos sobre o fundo
 * do app, centralizados na vertical. Ao aproximar o mouse, os ícones CRESCEM com
 * falloff suave — o sob o cursor mais, os vizinhos um pouco menos — igual ao dock
 * do macOS. Ao crescer eles SOBREPÕEM a área do módulo (sem recorte), então a
 * borda nunca some. Um separador divide cada grupo de menus. Reaproveita a mesma
 * config de navegação do menu clássico (ordem + grupos).
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

  // Lista achatada (Dashboard + grupos) com separadores entre os grupos.
  const fixedHead = nav.filter((i) => i.fixed && i.to === "/");
  const rows: Row[] = [];
  fixedHead.forEach((item) => rows.push({ kind: "item", item }));
  NAV_GROUP_ORDER.forEach((g) => {
    const group = nav.filter((i) => i.group === g);
    if (group.length === 0) return;
    if (rows.length > 0) rows.push({ kind: "sep" });
    group.forEach((item) => rows.push({ kind: "item", item }));
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

  // ── Rolagem para janelas baixas ──────────────────────────────────────────
  // O magnify precisa de overflow VISÍVEL (o tile cresce sobre o módulo), o que
  // conflita com rolagem nativa. Então só ligamos a rolagem QUANDO os ícones não
  // cabem na altura; aí aparecem setas que rolam ao passar o mouse — senão, em
  // janela pequena, não dava pra alcançar os ícones de baixo.
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [arrows, setArrows] = useState({ up: false, down: false });

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    // Mede a altura REAL do conteúdo (offsetHeight), não o scrollHeight do
    // container: com overflow:visible (necessário pro magnify crescer sobre o
    // módulo) o scrollHeight fica = clientHeight e a rolagem NUNCA era detectada
    // — por isso, em janela baixa, não apareciam setas nem dava pra alcançar os
    // ícones de baixo. offsetHeight do conteúdo é confiável nos dois modos.
    const contentH = content.offsetHeight;
    const can = contentH - el.clientHeight > 4;
    setScrollable(can);
    setArrows({
      up: can && el.scrollTop > 4,
      down: can && el.scrollTop < contentH - el.clientHeight - 4,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    const onResize = () => updateArrows();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateArrows, nav]);

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);
  const startAutoScroll = useCallback(
    (dir: number) => {
      stopAutoScroll();
      const tick = () => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop += dir * 5;
          updateArrows();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopAutoScroll, updateArrows]
  );
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  // Índice só dos itens (separadores não entram no array de refs).
  let itemIdx = -1;

  return (
    <TooltipProvider delayDuration={120}>
      {/* Coluna transparente. Normalmente overflow visível (o tile cresce sobre o
          módulo ao magnificar); quando os ícones não cabem, vira rolável + setas. */}
      <div className="relative flex h-screen w-[4.5rem] shrink-0 flex-col items-center">
        {arrows.up && (
          <button
            type="button"
            aria-label="Rolar para cima"
            onMouseEnter={() => startAutoScroll(-1)}
            onMouseLeave={stopAutoScroll}
            onClick={() => scrollRef.current?.scrollBy({ top: -140, behavior: "smooth" })}
            className="absolute top-0 z-20 flex h-5 w-9 items-center justify-center rounded-b-xl border border-t-0 border-white/15 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-md transition hover:text-foreground"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className={cn(
            "flex w-full min-h-0 flex-1 flex-col items-center no-scrollbar",
            scrollable ? "overflow-y-auto" : "overflow-visible"
          )}
        >
          <div
            ref={contentRef}
            className={cn("flex flex-col items-center gap-2 py-3", !scrollable && "my-auto")}
            onMouseMove={(e) => magnify(e.clientY)}
            onMouseLeave={reset}
          >
          {rows.map((row, i) => {
            if (row.kind === "sep") {
              return (
                <div
                  key={`sep-${i}`}
                  aria-hidden
                  className="my-1 h-px w-7 rounded-full bg-border/70"
                />
              );
            }
            const { item } = row;
            const Icon = item.icon;
            itemIdx += 1;
            const refIdx = itemIdx;
            return (
              <div
                key={item.to}
                ref={(el) => {
                  itemRefs.current[refIdx] = el;
                }}
                className="transition-transform duration-100 ease-out will-change-transform"
                style={{ transformOrigin: "left center" }}
              >
                <Tooltip delayDuration={120}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className="group relative inline-flex h-11 w-11 items-center justify-center rounded-2xl"
                    >
                      {({ isActive }) => (
                        <>
                          {/* base de vidro: degradê + borda + sombra + blur */}
                          <span
                            aria-hidden
                            className={cn(
                              "pointer-events-none absolute inset-0 rounded-[inherit] border bg-gradient-to-br shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors",
                              isActive
                                ? "border-primary/45 from-primary/30 to-primary/[0.08] ring-1 ring-inset ring-primary/30"
                                : "border-white/15 from-white/25 to-white/[0.04] dark:border-white/[0.35] dark:from-white/[0.42] dark:to-white/[0.14]"
                            )}
                          />
                          {/* reflexo: brilho de vidro no topo (mais discreto no escuro,
                              onde o branco forte ficava "sujo") */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-1 top-1 h-[42%] rounded-[inherit] bg-gradient-to-b from-white/55 to-transparent opacity-70 dark:from-white/40 dark:opacity-60"
                          />
                          <Icon
                            className={cn(
                              "relative block h-[1.15rem] w-[1.15rem] shrink-0 transition-colors",
                              isActive
                                ? "text-primary drop-shadow-sm"
                                : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />
                        </>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              </div>
            );
          })}

          </div>
        </div>
        {arrows.down && (
          <button
            type="button"
            aria-label="Rolar para baixo"
            onMouseEnter={() => startAutoScroll(1)}
            onMouseLeave={stopAutoScroll}
            onClick={() => scrollRef.current?.scrollBy({ top: 140, behavior: "smooth" })}
            className="absolute bottom-[3.75rem] z-20 flex h-5 w-9 items-center justify-center rounded-t-xl border border-b-0 border-white/15 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-md transition hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
        {/* rodapé fixo: expandir menu (sempre acessível, fora da rolagem) */}
        <div className="flex shrink-0 flex-col items-center pb-3 pt-1">
          <div className="mb-1 h-px w-7 rounded-full bg-border/70" aria-hidden />
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSidebarLayout("classic")}
                aria-label="Expandir menu (mostrar nomes)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-muted-foreground shadow-sm backdrop-blur-md transition-transform duration-150 ease-out hover:scale-110 hover:text-foreground dark:bg-white/[0.06]"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir (mostrar nomes)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
