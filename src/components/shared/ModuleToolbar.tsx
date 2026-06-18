import { useState, type ReactNode } from "react";
import { Filter, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Action = {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
};

export type SummaryCard = { label: string; value: ReactNode; icon?: LucideIcon };

/**
 * Topo padrão dos módulos:
 *  1) ações (principal destacada à direita + secundárias ao lado);
 *  2) cards de resumo (na cor de destaque do usuário);
 *  3) busca global + botão único "Filtros" (abre painel) + alternador de view.
 */
export function ModuleToolbar({
  primaryAction,
  secondaryActions = [],
  summaryCards = [],
  search,
  filters,
  filtersActiveCount = 0,
  viewToggle,
  children,
}: {
  primaryAction?: Action;
  secondaryActions?: Action[];
  summaryCards?: SummaryCard[];
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Controles de filtro — revelados no painel ao clicar em "Filtros". */
  filters?: ReactNode;
  filtersActiveCount?: number;
  /** Alternador de view (ex.: <ViewToggle/> ou <TabsList/>), à direita. */
  viewToggle?: ReactNode;
  children?: ReactNode;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* 1 — ações */}
      {(primaryAction || secondaryActions.length > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {secondaryActions.map((a) => (
            <Button key={a.label} variant={a.variant ?? "outline"} onClick={a.onClick}>
              {a.icon && <a.icon className="h-4 w-4" />}
              {a.label}
            </Button>
          ))}
          {primaryAction && (
            <Button variant={primaryAction.variant ?? "default"} onClick={primaryAction.onClick}>
              {primaryAction.icon && <primaryAction.icon className="h-4 w-4" />}
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}

      {/* 2 — cards de resumo (cor do usuário) */}
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

      {/* 3 — busca global + filtros + view */}
      {(search || filters || viewToggle) && (
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
              variant={filtersOpen || filtersActiveCount > 0 ? "secondary" : "outline"}
              onClick={() => setFiltersOpen((o) => !o)}
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
          {viewToggle && <div className="ml-auto">{viewToggle}</div>}
        </div>
      )}

      {/* painel de filtros */}
      {filters && filtersOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
          {filters}
        </div>
      )}

      {children}
    </div>
  );
}
