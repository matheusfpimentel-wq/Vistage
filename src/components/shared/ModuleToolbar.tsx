import { useState, type ReactNode } from "react";
import { Filter, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Action = {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
};

export type SummaryCard = { label: string; value: ReactNode; icon?: LucideIcon };

/**
 * Topo padrão dos módulos. A ORDEM é a regra, e vale pros 13 módulos de uma vez
 * porque todos passam por aqui (ver §10 do UI_GUIDELINES):
 *
 *   [leftControls][secondaryActions]  [busca] [Filtros]        [ação principal]
 *   └─ encostado no menu lateral                                └─ ml-auto
 *
 * Tudo que NÃO é a busca, o botão "Filtros" ou a ação principal fica à
 * ESQUERDA, colado no menu: alternância de visão, densidade, filtros rápidos
 * em ícone, ações secundárias. Os três exceptuados mantêm o lugar de sempre.
 *
 * A busca NÃO estica. Era o `flex-1` dela que empurrava "Filtros" e os botões
 * de visão pro meio da tela e fazia o topo parecer desalinhado de módulo pra
 * módulo, porque cada placeholder tem um tamanho. Em telas estreitas ela volta
 * a crescer, que é onde isso ajuda em vez de atrapalhar.
 *
 * Também: cards de resumo opcionais no topo e um contador discreto
 * "N registros encontrados" embaixo.
 */
export function ModuleToolbar({
  primaryAction,
  secondaryActions = [],
  summaryCards = [],
  search,
  filters,
  filtersActiveCount = 0,
  resultCount,
  resultLabel = "registros encontrados",
  leftControls,
  children,
}: {
  primaryAction?: Action;
  secondaryActions?: Action[];
  summaryCards?: SummaryCard[];
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Controles de filtro — abrem numa janela ao clicar em "Filtros". */
  filters?: ReactNode;
  filtersActiveCount?: number;
  /** Total após busca/filtros — exibido discreto abaixo da busca. */
  resultCount?: number;
  resultLabel?: string;
  /**
   * Controles do módulo que ficam na PONTA ESQUERDA, colados no menu lateral:
   * alternância de visão, densidade de lista, filtros rápidos em ícone. Chamava
   * `viewToggle`, mas o nome mentia — o Pessoas já mandava os filtros de papel
   * por aqui, que não são alternância de visão nenhuma.
   */
  leftControls?: ReactNode;
  children?: ReactNode;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-3">
      {summaryCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summaryCards.map((c) => (
            <div key={c.label} className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {c.icon && <c.icon className="h-3.5 w-3.5" />}
                {c.label}
              </div>
              <div className="text-2xl font-semibold text-primary">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {(search || filters || leftControls || primaryAction || secondaryActions.length > 0) && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {/* ESQUERDA — tudo que não é busca, Filtros ou ação principal. */}
            {leftControls}
            {secondaryActions.map((a) => (
              <Button key={a.label} variant={a.variant ?? "outline"} onClick={a.onClick}>
                {a.icon && <a.icon className="h-4 w-4" />}
                {a.label}
              </Button>
            ))}
            {search && (
              // Largura limitada no desktop (era `flex-1`, e por isso empurrava
              // o resto pro meio); volta a crescer só em tela estreita.
              <div className="relative min-w-[9rem] flex-1 sm:w-72 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder={search.placeholder ?? "Buscar…"}
                  className="pl-8"
                />
              </div>
            )}
            {filters && (
              <Button
                variant={filtersActiveCount > 0 ? "secondary" : "outline"}
                onClick={() => setFiltersOpen(true)}
                className="gap-1.5"
              >
                <Filter className="h-4 w-4" /> Filtros
                {filtersActiveCount > 0 && (
                  <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-xs font-medium text-primary">
                    {filtersActiveCount}
                  </span>
                )}
              </Button>
            )}
            {primaryAction && (
              // Ação principal sempre à direita — mesmo sem busca (ex.: aba
              // Alunos), pra ficar consistente com os demais módulos.
              <div className="ml-auto">
                <Button
                  variant={primaryAction.variant ?? "default"}
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.icon && <primaryAction.icon className="h-4 w-4" />}
                  {primaryAction.label}
                </Button>
              </div>
            )}
          </div>
          {resultCount != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {resultCount} {resultLabel}
            </p>
          )}
        </div>
      )}

      {filters && (
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Filtros avançados</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-1">{filters}</div>
            <DialogFooter>
              <Button onClick={() => setFiltersOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {children}
    </div>
  );
}
