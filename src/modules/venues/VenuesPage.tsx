import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { VenueForm } from "./forms/VenueForm";
import { VenueDetail } from "./forms/VenueDetail";
import { deleteVenue, listVenues, type VenueFilters } from "./api";
import type { Venue } from "./types";
import { useNewItemShortcut } from "@/lib/shortcuts";

export function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [filters, setFilters] = useState({ city: "", search: "" });

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
    const ok = window.confirm(
      `Excluir "${v.name}"? GIGs vinculadas vão perder a referência mas preservam o nome do venue como texto.`
    );
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
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo venue
        </Button>
      </div>

      {venues.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum venue cadastrado ainda.
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
