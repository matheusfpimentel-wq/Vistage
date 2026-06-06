import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Building2,
  Calendar,
  CheckSquare,
  CornerDownLeft,
  Film,
  GraduationCap,
  Heart,
  Lightbulb,
  Music,
  PartyPopper,
  Search,
  Store,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { globalSearch, KIND_LABEL, type SearchHit } from "@/lib/search";
import { DEFAULT_NAV, NAV_GROUP_META, NAV_GROUP_ORDER } from "@/lib/nav";
import { triggerQuickCapture } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<SearchHit["kind"], React.ComponentType<{ className?: string }>> = {
  gig: Calendar,
  contact: Users,
  task: CheckSquare,
  transaction: Wallet,
  venue: Building2,
  supplier: Store,
  fan: Heart,
  content: Film,
  idea: Lightbulb,
  student: GraduationCap,
  track: Music,
  party: PartyPopper,
  decision: BookOpen,
};

type QuickAction = {
  id: string;
  label: string;
  icon: React.ElementType;
  run: () => void;
  /** Mostrado mesmo com a busca vazia. */
  primary?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Ações rápidas: captura de ideia + navegação para dashboards e módulos.
  const allActions = useMemo<QuickAction[]>(() => {
    const go = (route: string) => () => {
      onOpenChange(false);
      navigate(route);
    };
    const actions: QuickAction[] = [
      {
        id: "quick-capture",
        label: "Captura rápida de ideia",
        icon: Zap,
        primary: true,
        run: () => {
          onOpenChange(false);
          triggerQuickCapture();
        },
      },
    ];
    // Dashboards de grupo (destaque)
    for (const group of NAV_GROUP_ORDER) {
      const meta = NAV_GROUP_META[group];
      actions.push({
        id: `group-${group}`,
        label: `Ir para ${group}`,
        icon: meta.icon,
        primary: true,
        run: go(meta.to),
      });
    }
    // Todos os módulos
    for (const item of DEFAULT_NAV) {
      actions.push({
        id: `nav-${item.to}`,
        label: `Ir para ${item.label}`,
        icon: item.icon,
        run: go(item.to),
      });
    }
    return actions;
  }, [navigate, onOpenChange]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allActions.filter((a) => a.primary);
    return allActions.filter((a) => a.label.toLowerCase().includes(q)).slice(0, 6);
  }, [query, allActions]);

  // debounce busca
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setHits([]);
      setActiveIndex(0);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const result = await globalSearch(query);
        setHits(result);
        setActiveIndex(0);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, open]);

  const grouped = useMemo(() => {
    const groups = new Map<SearchHit["kind"], SearchHit[]>();
    for (const h of hits) {
      const arr = groups.get(h.kind) ?? [];
      arr.push(h);
      groups.set(h.kind, arr);
    }
    return groups;
  }, [hits]);

  // Lista combinada para navegação por teclado: ações primeiro, depois hits.
  const totalRows = filteredActions.length + hits.length;

  function runRow(index: number) {
    if (index < filteredActions.length) {
      filteredActions[index]?.run();
    } else {
      const hit = hits[index - filteredActions.length];
      if (hit) {
        onOpenChange(false);
        navigate(hit.route);
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, totalRows - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runRow(activeIndex);
    }
  }

  const hasResults = totalRows > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden" hideClose>
        <DialogTitle className="sr-only">Busca global</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar ou executar uma ação…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-1">
          {/* Ações rápidas */}
          {filteredActions.length > 0 && (
            <div className="pb-1">
              <div className="px-2 pb-1 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                Ações
              </div>
              {filteredActions.map((a, i) => {
                const Icon = a.icon;
                const active = i === activeIndex;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => a.run()}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      active && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{a.label}</span>
                    {active && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Resultados da busca */}
          {query.trim() === "" ? null : loading ? (
            <Empty>Buscando…</Empty>
          ) : hits.length === 0 && filteredActions.length === 0 ? (
            <Empty>Nenhum resultado para "{query}".</Empty>
          ) : (
            (["gig", "party", "venue", "supplier", "contact", "fan", "student", "content", "idea", "task", "transaction"] as SearchHit["kind"][])
              .filter((k) => grouped.has(k))
              .map((kind) => {
                const items = grouped.get(kind)!;
                const Icon = KIND_ICON[kind];
                return (
                  <div key={kind} className="pb-1">
                    <div className="px-2 pb-1 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {KIND_LABEL[kind]}
                    </div>
                    {items.map((hit) => {
                      const rowIdx = filteredActions.length + hits.indexOf(hit);
                      const active = rowIdx === activeIndex;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          type="button"
                          onMouseEnter={() => setActiveIndex(rowIdx)}
                          onClick={() => runRow(rowIdx)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                            active && "bg-accent text-accent-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{hit.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
          )}

          {!hasResults && query.trim() === "" && (
            <div className="px-3 pb-2 pt-1 text-center text-xs text-muted-foreground">
              Setas ↑ ↓ navegam, Enter abre.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
