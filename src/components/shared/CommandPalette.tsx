import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Calendar,
  CheckSquare,
  Film,
  GraduationCap,
  Heart,
  Lightbulb,
  Music,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { globalSearch, KIND_LABEL, type SearchHit } from "@/lib/search";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<SearchHit["kind"], React.ComponentType<{ className?: string }>> = {
  gig: Calendar,
  contact: Users,
  task: CheckSquare,
  transaction: Wallet,
  venue: Building2,
  fan: Heart,
  content: Film,
  idea: Lightbulb,
  student: GraduationCap,
  track: Music,
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

  function handleSelect(hit: SearchHit) {
    onOpenChange(false);
    navigate(hit.route);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[activeIndex]) {
      e.preventDefault();
      handleSelect(hits[activeIndex]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl p-0 gap-0 overflow-hidden"
        hideClose
      >
        <DialogTitle className="sr-only">Busca global</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar em GIGs, contatos, tarefas, financeiro…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-1">
          {query.trim() === "" ? (
            <Empty>
              Comece a digitar para buscar.
              <div className="mt-1 text-xs">
                Setas ↑ ↓ navegam, Enter abre.
              </div>
            </Empty>
          ) : loading ? (
            <Empty>Buscando…</Empty>
          ) : hits.length === 0 ? (
            <Empty>Nenhum resultado para "{query}".</Empty>
          ) : (
            <>
              {(["gig", "venue", "contact", "fan", "student", "content", "idea", "task", "transaction"] as SearchHit["kind"][])
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
                        const globalIdx = hits.indexOf(hit);
                        const active = globalIdx === activeIndex;
                        return (
                          <button
                            key={`${hit.kind}-${hit.id}`}
                            type="button"
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            onClick={() => handleSelect(hit)}
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
                })}
            </>
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
