import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarRange,
  Film,
  Loader2,
  Music,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { loadCareerTimeline, type Milestone, type MilestoneKind } from "./api";

const KIND_META: Record<
  MilestoneKind,
  { icon: typeof Music; label: string; dot: string; chip: string }
> = {
  gig: { icon: CalendarRange, label: "GIG", dot: "bg-primary", chip: "border-primary/40 text-primary" },
  release: { icon: Music, label: "Lançamento", dot: "bg-fuchsia-500", chip: "border-fuchsia-500/40 text-fuchsia-400" },
  content: { icon: Film, label: "Conteúdo", dot: "bg-emerald-500", chip: "border-emerald-500/40 text-emerald-400" },
  party: { icon: PartyPopper, label: "Festa", dot: "bg-pink-500", chip: "border-pink-500/40 text-pink-400" },
  okr: { icon: Sparkles, label: "Meta", dot: "bg-amber-500", chip: "border-amber-500/40 text-amber-400" },
};

const KIND_FILTERS: { value: MilestoneKind | "all"; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "gig", label: "GIGs" },
  { value: "release", label: "Lançamentos" },
  { value: "content", label: "Conteúdos" },
  { value: "party", label: "Festas" },
];

/**
 * Linha do tempo da carreira — visão cronológica e privada de tudo que
 * aconteceu: GIGs realizadas, lançamentos, conteúdos e festas. Útil pra
 * press kit, retrospectiva e motivação.
 */
export function CareerTimelinePage() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MilestoneKind | "all">("all");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      loadCareerTimeline()
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    window.addEventListener(DATA_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(DATA_CHANGED, load);
    };
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((m) => m.kind === filter)),
    [items, filter]
  );

  // Agrupa por ano → mês para os cabeçalhos da timeline.
  const groups = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const m of filtered) {
      const ym = m.date.slice(0, 7); // YYYY-MM
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of items) c[m.kind] = (c[m.kind] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Linha do tempo da carreira</h1>
        <p className="text-sm text-muted-foreground">
          {items.length === 0
            ? "Seus marcos aparecem aqui conforme você realiza GIGs, lança músicas e publica conteúdo."
            : `${items.length} marcos · ${counts.gig ?? 0} GIGs · ${counts.release ?? 0} lançamentos · ${counts.content ?? 0} conteúdos · ${counts.party ?? 0} festas`}
        </p>
      </div>

      {/* Filtros por tipo */}
      <div className="flex flex-wrap gap-1.5">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              filter === f.value
                ? "border-primary bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhum marco ainda"
          description="Conclua uma GIG, lance uma música ou publique um conteúdo para começar a construir sua linha do tempo."
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([ym, milestones]) => (
            <section key={ym}>
              <h2 className="sticky top-0 z-10 mb-2 bg-background/95 py-1 text-sm font-semibold capitalize text-muted-foreground backdrop-blur">
                {formatDate(`${ym}-01`, "MMMM yyyy")}
              </h2>
              <ol className="relative space-y-3 border-l pl-5">
                {milestones.map((m) => {
                  const meta = KIND_META[m.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={m.key} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[1.46rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background",
                          meta.dot
                        )}
                      />
                      <Link
                        to={m.to}
                        className="flex items-start gap-3 rounded-lg border p-3 transition hover:bg-accent"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{m.title}</span>
                            <Badge variant="outline" className={cn("shrink-0 text-[10px]", meta.chip)}>
                              {meta.label}
                            </Badge>
                          </div>
                          {m.subtitle && (
                            <div className="truncate text-xs text-muted-foreground">
                              {m.subtitle}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatDate(m.date, "dd MMM")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
