import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PanelLeftOpen,
} from "lucide-react";
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
const RANGE = 110; // px de influência do cursor (ao longo do eixo)
const MAX_BOOST = 0.55; // escala extra no ícone sob o cursor (1 + 0.55 = 1.55×)
const EDGE = 26; // faixa junto à borda que dispara a auto-rolagem

type Row =
  | { kind: "sep" }
  | { kind: "item"; item: NavItem };

/**
 * Menu COMPACTO (modo ícones): tiles de "vidro" suspensos sobre o fundo do app.
 * Ao aproximar o mouse, os ícones CRESCEM com falloff suave — o sob o cursor
 * mais, os vizinhos um pouco menos — igual ao dock do macOS. Ao crescer eles
 * SOBREPÕEM a área do módulo (sem recorte), então a borda nunca some. Um
 * separador divide cada grupo de menus. Reaproveita a mesma config de navegação
 * do menu clássico (ordem + grupos).
 *
 * Serve os DOIS modos compactos, pela prop `orientation`:
 *  - "vertical"   → coluna à esquerda; os tiles crescem pra direita.
 *  - "horizontal" → dock no rodapé; os tiles crescem pra CIMA.
 *
 * É o mesmo componente de propósito: a magnificação, a auto-rolagem, os grupos
 * e os tiles são a mesma lógica em eixos trocados. Duplicar daria dois lugares
 * pra consertar o mesmo bug — e o dock do macOS, que é a referência, é
 * horizontal mesmo.
 */
export function SidebarRail({
  onNavigate,
  orientation = "vertical",
}: {
  onNavigate?: () => void;
  orientation?: "vertical" | "horizontal";
}) {
  /** true = dock deitado no rodapé. Usado em cada eixo abaixo. */
  const H = orientation === "horizontal";
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

  function magnify(cursor: number) {
    for (const el of itemRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const center = H ? r.left + r.width / 2 : r.top + r.height / 2;
      const d = Math.abs(cursor - center);
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

  // ── Rolagem para janelas apertadas ───────────────────────────────────────
  // O magnify precisa de overflow VISÍVEL (o tile cresce sobre o módulo), o que
  // conflita com rolagem nativa. Então só ligamos a rolagem QUANDO os ícones não
  // cabem; aí aparecem setas e a auto-rolagem por proximidade — senão, em janela
  // pequena, não dava pra alcançar os ícones do fim.
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [arrows, setArrows] = useState({ start: false, end: false });

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    // Mede a extensão REAL do conteúdo (offsetWidth/Height), não o scrollWidth/
    // Height do container: com overflow:visible (necessário pro magnify crescer
    // sobre o módulo) o scroll* fica = client* e a rolagem NUNCA era detectada.
    const contentSize = H ? content.offsetWidth : content.offsetHeight;
    const viewSize = H ? el.clientWidth : el.clientHeight;
    const pos = H ? el.scrollLeft : el.scrollTop;
    const can = contentSize - viewSize > 4;
    setScrollable(can);
    setArrows({
      start: can && pos > 4,
      end: can && pos < contentSize - viewSize - 4,
    });
  }, [H]);

  useEffect(() => {
    updateArrows();
    const onResize = () => updateArrows();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateArrows, nav]);

  // Direção atual (-1 início, 0 parado, 1 fim). Existe porque o gatilho é o
  // mousemove, que dispara dezenas de vezes por segundo: sem isso o rAF seria
  // cancelado e recriado a cada evento.
  const dirRef = useRef(0);
  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dirRef.current = 0;
  }, []);
  const startAutoScroll = useCallback(
    (dir: number) => {
      if (dirRef.current === dir) return; // já rolando pra cá
      stopAutoScroll();
      dirRef.current = dir;
      const tick = () => {
        const el = scrollRef.current;
        if (el) {
          if (H) el.scrollLeft += dir * 5;
          else el.scrollTop += dir * 5;
          updateArrows();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [H, stopAutoScroll, updateArrows]
  );
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  /**
   * Auto-rolagem por PROXIMIDADE da borda, não por hover num botão.
   *
   * O gatilho era `onMouseEnter` nas setas, e era isso que criava o bug: pra
   * receber o mouse elas precisavam ficar acima dos tiles, e aí cobriam o ícone
   * magnificado embaixo delas. Aqui o gatilho é a posição do cursor, que o
   * mousemove do magnify já tinha em mãos — então as setas não precisam mais
   * receber evento nenhum e podem ficar embaixo.
   */
  const edgeScroll = useCallback(
    (cursor: number) => {
      const el = scrollRef.current;
      if (!el || !scrollable) {
        stopAutoScroll();
        return;
      }
      const r = el.getBoundingClientRect();
      const start = H ? r.left : r.top;
      const end = H ? r.right : r.bottom;
      if (cursor - start < EDGE) startAutoScroll(-1);
      else if (end - cursor < EDGE) startAutoScroll(1);
      else stopAutoScroll();
    },
    [H, scrollable, startAutoScroll, stopAutoScroll]
  );

  // Índice só dos itens (separadores não entram no array de refs).
  let itemIdx = -1;

  const ArrowStart = H ? ChevronLeft : ChevronUp;
  const ArrowEnd = H ? ChevronRight : ChevronDown;
  const tooltipSide = H ? "top" : "right";

  return (
    <TooltipProvider delayDuration={120}>
      {/* Faixa transparente. Normalmente overflow visível (o tile cresce sobre o
          módulo ao magnificar); quando os ícones não cabem, vira rolável. */}
      <div
        className={cn(
          "relative flex shrink-0 items-center",
          H ? "h-[4.5rem] w-full flex-row" : "h-screen w-[4.5rem] flex-col"
        )}
      >
        {/* Setas: DICA VISUAL, não botão. Quem rola é a proximidade do cursor
            (ver edgeScroll). `pointer-events-none` + z abaixo do conteúdo é o
            que impede de voltarem a cobrir o ícone magnificado. Não são
            <button> de propósito: botão que não recebe clique é mentira pro
            leitor de tela. */}
        {arrows.start && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute z-10 flex items-center justify-center border border-white/15 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-md",
              H
                ? "left-0 h-9 w-5 rounded-r-xl border-l-0"
                : "top-0 h-5 w-9 rounded-b-xl border-t-0"
            )}
          >
            <ArrowStart className="h-4 w-4" />
          </div>
        )}
        <div
          ref={scrollRef}
          onScroll={updateArrows}
          className={cn(
            "flex no-scrollbar",
            H ? "min-w-0 flex-1 flex-row items-center" : "min-h-0 flex-1 flex-col items-center",
            // Rolando: o overflow numa direção corta também na outra, comendo a
            // borda/sombra e a animação do tile na fronteira com o módulo. Aqui
            // a caixa de recorte é esticada NO SENTIDO EM QUE O TILE CRESCE (pra
            // direita na vertical, pra cima no rodapé) e o container vira
            // pointer-events-none (o conteúdo reativa) pra cliques no módulo, na
            // faixa esticada, passarem direto.
            scrollable
              ? H
                ? "self-end h-[calc(4.5rem+2.5rem)] overflow-x-auto pt-10 pointer-events-none"
                : "self-start w-[calc(4.5rem+2.5rem)] overflow-y-auto pr-10 pointer-events-none"
              : H
                ? "h-full overflow-visible"
                : "w-full overflow-visible"
          )}
        >
          <div
            ref={contentRef}
            // `relative z-20`: põe os tiles ACIMA das setas (z-10). Sem isso o
            // ícone magnificado aparecia cortado pela seta.
            className={cn(
              "pointer-events-auto relative z-20 flex items-center gap-2",
              H ? "flex-row px-3" : "flex-col py-3",
              !scrollable && (H ? "mx-auto" : "my-auto")
            )}
            onMouseMove={(e) => {
              const cursor = H ? e.clientX : e.clientY;
              magnify(cursor);
              edgeScroll(cursor);
            }}
            onMouseLeave={() => {
              reset();
              stopAutoScroll();
            }}
          >
            {rows.map((row, i) => {
              if (row.kind === "sep") {
                return (
                  <div
                    key={`sep-${i}`}
                    aria-hidden
                    className={cn(
                      "rounded-full bg-border/70",
                      H ? "mx-1 h-7 w-px" : "my-1 h-px w-7"
                    )}
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
                  // A origem é a borda em que o dock está encostado, pra o tile
                  // crescer PRA DENTRO da tela e nunca pra fora dela.
                  style={{ transformOrigin: H ? "center bottom" : "left center" }}
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
                            {/* base: claro = vidro; escuro = chapado e escuro, com
                                SOMBRA visível no fundo (sem degradê/brilho). */}
                            <span
                              aria-hidden
                              className={cn(
                                "pointer-events-none absolute inset-0 rounded-[inherit] border bg-gradient-to-br shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors dark:shadow-[0_7px_18px_0_rgba(0,0,0,0.85)]",
                                isActive
                                  ? "border-primary/45 from-primary/30 to-primary/[0.08] ring-1 ring-inset ring-primary/30 dark:bg-none dark:bg-primary/25"
                                  : "border-white/15 from-white/25 to-white/[0.04] dark:border-white/[0.06] dark:bg-none dark:bg-white/[0.06]"
                              )}
                            />
                            {/* reflexo: brilho de vidro no topo — SÓ no claro (no
                                escuro o botão é plano, sem brilho). */}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-1 top-1 h-[42%] rounded-[inherit] bg-gradient-to-b from-white/55 to-transparent opacity-70 dark:opacity-0"
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
                    <TooltipContent side={tooltipSide}>{item.label}</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
        {arrows.end && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute z-10 flex items-center justify-center border border-white/15 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-md",
              H
                ? "right-[3.75rem] h-9 w-5 rounded-l-xl border-r-0"
                : "bottom-[3.75rem] h-5 w-9 rounded-t-xl border-b-0"
            )}
          >
            <ArrowEnd className="h-4 w-4" />
          </div>
        )}
        {/* fim fixo: expandir menu (sempre acessível, fora da rolagem) */}
        <div
          className={cn(
            "flex shrink-0 items-center",
            H ? "flex-row pl-1 pr-3" : "flex-col pb-3 pt-1"
          )}
        >
          <div
            className={cn("rounded-full bg-border/70", H ? "mr-1 h-7 w-px" : "mb-1 h-px w-7")}
            aria-hidden
          />
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
            <TooltipContent side={tooltipSide}>Expandir (mostrar nomes)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
