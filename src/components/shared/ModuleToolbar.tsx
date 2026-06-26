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
 * Topo padrão dos módulos:
 *  - cards de resumo opcionais (na cor de destaque do usuário);
 *  - busca global + botão "Filtros" (abre uma JANELA de filtro avançado) +
 *    ação principal na MESMA linha quando couber;
 *  - contador discreto "N registros encontrados" abaixo da busca.
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
  viewToggle,
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
  viewToggle?: ReactNode;
  children?: ReactNode;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasActions = !!primaryAction || secondaryActions.length > 0;

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

      {(search || filters || viewToggle || hasActions) && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {search && (
              <div className="relative min-w-[12rem] flex-1">
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
            {viewToggle}
            {hasActions && (
              // Ação principal sempre à direita — mesmo sem busca (ex.: aba Alunos),
              // pra ficar consistente com os demais módulos.
              <div className="ml-auto flex items-center gap-2">
                {secondaryActions.map((a) => (
                  <Button key={a.label} variant={a.variant ?? "outline"} onClick={a.onClick}>
                    {a.icon && <a.icon className="h-4 w-4" />}
                    {a.label}
                  </Button>
                ))}
                {primaryAction && (
                  <Button
                    variant={primaryAction.variant ?? "default"}
                    onClick={primaryAction.onClick}
                  >
                    {primaryAction.icon && <primaryAction.icon className="h-4 w-4" />}
                    {primaryAction.label}
                  </Button>
                )}
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
