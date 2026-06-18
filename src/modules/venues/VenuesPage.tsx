import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, LayoutGrid, List, Loader2, Map, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

const VenueMap = lazy(() =>
  import("./VenueMap").then((m) => ({ default: m.VenueMap }))
);
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { VenueForm } from "./forms/VenueForm";
import { VenueDetail } from "./forms/VenueDetail";
import { deleteVenue, getVenue, listVenues, updateVenue, type VenueFilters } from "./api";
import type { Venue, VenueType } from "./types";
import { VenuePriorityBadge, prioritySortWeight } from "./components/VenueStar";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { useImageUrl } from "@/lib/uploads";
import { PendingTasksBadge } from "@/modules/tasks/components/PendingTasksBadge";
import { cn } from "@/lib/utils";

type ViewMode = "cards" | "list" | "map";

const CARD_GROUPS: Array<VenueType | "__other__"> = [
  "Club", "Bar", "Espaço para eventos", "Festival", "Teatro", "Outro", "__other__",
];

export function VenuesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ city: "", search: "" });
  const [view, setView] = useState<ViewMode>("cards");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Frozen card order — only rebuilt when a full fetch happens
  const cardOrderRef = useRef<Venue[]>([]);

  const queryFilters: VenueFilters = useMemo(
    () => ({ city: filters.city, search: filters.search }),
    [filters]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listVenues(queryFilters);
      setVenues(data);
      cardOrderRef.current = [...data].sort((a, b) => {
        const w = prioritySortWeight(a.priority) - prioritySortWeight(b.priority);
        return w !== 0 ? w : a.name.localeCompare(b.name);
      });
    } finally {
      setLoading(false);
    }
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const id = Number(openId);
    void getVenue(id).then((venue) => {
      if (venue) {
        setDetailId(venue.id);
        setDetailOpen(true);
      }
    });
    setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { sorted: sortedVenues, sortKey, sortDir, handleSort } = useTableSort(venues);

  async function cyclePriority(v: Venue) {
    const priorities: Array<Venue["priority"]> = [null, "Alta", "Média", "Baixa"];
    const idx = priorities.indexOf(v.priority);
    const next = priorities[(idx + 1) % priorities.length];
    // Optimistic badge update without reordering cards
    setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, priority: next } : x)));
    cardOrderRef.current = cardOrderRef.current.map((x) => (x.id === v.id ? { ...x, priority: next } : x));
    try {
      await updateVenue({ id: v.id, priority: next });
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
      await refresh();
    }
  }

  const cardVenues = cardOrderRef.current.length > 0 ? cardOrderRef.current : [...venues];

  const groupedCards = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: Venue[] }> = [];
    for (const group of CARD_GROUPS) {
      const items =
        group === "__other__"
          ? cardVenues.filter((v) => !v.venue_type)
          : cardVenues.filter((v) => v.venue_type === group);
      if (items.length === 0) continue;
      const label =
        group === "__other__" ? "Sem tipo" :
        group === "Club" ? "Clubs" :
        group === "Bar" ? "Bares" :
        group === "Espaço para eventos" ? "Espaços para eventos" :
        group === "Festival" ? "Festivais" :
        group === "Teatro" ? "Teatros" : group;
      groups.push({ key: group, label, items });
    }
    return groups;
  }, [cardVenues]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(v: Venue) {
    setEditing(v);
    setFormOpen(true);
  }

  function openDetail(v: Venue) {
    setDetailId(v.id);
    setDetailOpen(true);
  }

  async function handleDelete(v: Venue) {
    const ok = await confirmDialog({
      title: "Excluir",
      description: `Excluir "${v.name}"? GIGs vinculadas vão perder a referência mas preservam o nome do venue como texto.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteVenue(v.id);
      toast.success("Venue excluído");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 bg-background pt-1 pb-3 flex flex-col gap-3">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo venue
          </Button>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar venue, dono, notas…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-72 pl-8"
            />
          </div>
          <Input
            placeholder="Cidade"
            value={filters.city}
            onChange={(e) =>
              setFilters((f) => ({ ...f, city: e.target.value }))
            }
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            <button
              onClick={() => setView("cards")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "cards"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Visualização em cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "list"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Visualização em lista"
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              onClick={() => setView("map")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "map"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Visualização em mapa"
            >
              <Map className="h-3.5 w-3.5" />
              Mapa
            </button>
          </div>
        </div>
        </div>
      </div>

      {view === "map" ? (
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando mapa…
            </div>
          }
        >
          <VenueMap
            venues={venues}
            onOpenDetail={openDetail}
            onRefresh={() => void refresh()}
          />
        </Suspense>
      ) : loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Carregando…</div>
      ) : venues.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum venue cadastrado ainda."
        />
      ) : view === "cards" ? (
        <div className="space-y-6">
          {groupedCards.map((group) => (
            <div key={group.key}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
                <Badge variant="outline" className="text-xs">{group.items.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((v) => (
                  <VenueCard
                    key={v.id}
                    venue={v}
                    onOpen={() => openDetail(v)}
                    onEdit={() => openEdit(v)}
                    onDelete={() => void handleDelete(v)}
                    onCyclePriority={() => void cyclePriority(v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortableHeader<Venue> col="priority" label="Prioridade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Venue> col="name" label="Nome" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Venue> col="venue_type" label="Tipo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Venue> col="city" label="Cidade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Venue> col="capacity" label="Capacidade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
                <SortableHeader<Venue> col="owner_name" label="Dono" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedVenues.map((v) => (
                <tr
                  key={v.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                  onClick={() => openDetail(v)}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => void cyclePriority(v)}
                      title="Clique para mudar prioridade"
                    >
                      {v.priority ? (
                        <VenuePriorityBadge priority={v.priority} />
                      ) : (
                        <span className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition">+ prioridade</span>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {v.name}
                    {v.founded_year && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        desde {v.founded_year}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{v.venue_type ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {[v.city, v.state].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {v.capacity ? (
                      <Badge variant="outline">{v.capacity}</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {v.owner_name ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(v)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(v)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VenueForm
        open={formOpen}
        onOpenChange={setFormOpen}
        venue={editing}
        onSaved={() => void refresh()}
      />

      <VenueDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        venueId={detailId}
        onEdit={(v) => {
          setDetailOpen(false);
          openEdit(v);
        }}
      />
    </div>
  );
}

function VenueCard({
  venue: v,
  onOpen,
  onEdit,
  onDelete,
  onCyclePriority,
}: {
  venue: Venue;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCyclePriority: () => void;
}) {
  const photoUrl = useImageUrl(v.photo_path);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary hover:shadow-md",
        v.is_closed === 1 && "opacity-50"
      )}
    >
      {v.priority && (
        <div className="absolute left-2 top-2 z-10">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCyclePriority(); }}
            title="Clique para mudar prioridade"
          >
            <VenuePriorityBadge priority={v.priority} />
          </button>
        </div>
      )}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-sm"
          aria-label="Editar"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-sm"
          aria-label="Excluir"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      <div className="h-32 w-full bg-muted">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={v.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Building2 className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-2 leading-tight">
          <span className="font-medium">{v.name}</span>
          {v.is_closed === 1 && <Badge variant="destructive" className="text-xs">Fechado</Badge>}
          <PendingTasksBadge entityType="venue" entityId={v.id} className="ml-auto" />
        </div>
        <div className="text-xs text-muted-foreground">
          {[v.city, v.state].filter(Boolean).join(" / ") || "—"}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {v.capacity && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {v.capacity}
            </Badge>
          )}
          {v.founded_year && <span className="tabular-nums">desde {v.founded_year}</span>}
          {!v.priority && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCyclePriority(); }}
              className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition"
              title="Definir prioridade"
            >
              + prioridade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
