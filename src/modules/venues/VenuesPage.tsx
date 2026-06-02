import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, LayoutGrid, List, Loader2, Map, Pencil, Plus, Search, Trash2, Users } from "lucide-react";

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
import { deleteVenue, listVenues, type VenueFilters } from "./api";
import type { Venue } from "./types";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { useImageUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type ViewMode = "cards" | "list" | "map";

export function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [filters, setFilters] = useState({ city: "", search: "" });
  const [view, setView] = useState<ViewMode>("cards");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const queryFilters: VenueFilters = useMemo(
    () => ({ city: filters.city, search: filters.search }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const data = await listVenues(queryFilters);
    setVenues(data);
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo venue
          </Button>
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
      ) : venues.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum venue cadastrado ainda.
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {venues.map((v) => (
            <VenueCard key={v.id} venue={v} onOpen={() => openDetail(v)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Cidade</th>
                <th className="px-3 py-2 text-right">Capacidade</th>
                <th className="px-3 py-2 text-left">Dono</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr
                  key={v.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                  onClick={() => openDetail(v)}
                >
                  <td className="px-3 py-2 font-medium">
                    {v.name}
                    {v.founded_year && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        desde {v.founded_year}
                      </span>
                    )}
                  </td>
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

function VenueCard({ venue: v, onOpen }: { venue: Venue; onOpen: () => void }) {
  const photoUrl = useImageUrl(v.photo_path);
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary hover:shadow-md"
    >
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
        <div className="font-medium leading-tight">{v.name}</div>
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
        </div>
      </div>
    </button>
  );
}
