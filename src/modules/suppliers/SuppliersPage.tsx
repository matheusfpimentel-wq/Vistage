import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Instagram,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { deleteSupplier, listSuppliers, type SupplierFilters } from "./api";
import { SUPPLIER_CATEGORIES, type Supplier, type SupplierCategory } from "./types";
import { SupplierForm } from "./forms/SupplierForm";
import { SupplierDetail } from "./SupplierDetail";
import { PendingTasksBadge } from "@/modules/tasks/components/PendingTasksBadge";

type ViewMode = "cards" | "list";

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            "h-3.5 w-3.5",
            s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SupplierCategory | "Todos">("Todos");
  const [view, setView] = useState<ViewMode>("cards");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const filters: SupplierFilters = useMemo(
    () => ({ search, category }),
    [search, category]
  );

  const { sorted, sortKey, sortDir, handleSort } = useTableSort(suppliers);

  const refresh = useCallback(async () => {
    const data = await listSuppliers(filters);
    setSuppliers(data);
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setFormOpen(true);
  }

  function openDetail(supplier: Supplier) {
    setDetailId(supplier.id);
    setDetailOpen(true);
  }

  async function handleDelete(s: Supplier) {
    const ok = await confirmDialog({ title: "Excluir", description: `Excluir "${s.name}"?`, confirmLabel: "Excluir", destructive: true });
    if (!ok) return;
    try {
      await deleteSupplier(s.id);
      toast.success("Fornecedor excluído");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background pt-1 pb-3 flex flex-col gap-3">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo fornecedor
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as SupplierCategory | "Todos")}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todas as categorias</SelectItem>
            {SUPPLIER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={cn(
              "px-2.5 py-1.5 transition-colors",
              view === "cards" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "px-2.5 py-1.5 transition-colors",
              view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        </div>
      </div>

      {/* Empty state */}
      {suppliers.length === 0 && (
        <EmptyState
          icon={Store}
          title="Nenhum fornecedor encontrado"
          description='Clique em "Novo fornecedor" para começar.'
        />
      )}

      {/* Cards view */}
      {view === "cards" && suppliers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <div
              key={s.id}
              className="group relative cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition hover:shadow-md"
              onClick={() => openDetail(s)}
            >
              <div className="absolute right-3 top-3 hidden gap-1 group-hover:flex">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Editar"
                  onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                >
                  <Plus className="h-3.5 w-3.5 rotate-45" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Excluir"
                  onClick={(e) => { e.stopPropagation(); void handleDelete(s); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.category && <Badge variant="secondary">{s.category}</Badge>}
                  <PendingTasksBadge entityType="supplier" entityId={s.id} />
                </div>
                <h3 className="font-semibold leading-tight">{s.name}</h3>
                <StarRating rating={s.rating} />
                {s.city && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {s.city}
                  </div>
                )}
                <div className="space-y-1">
                  {s.phone && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      {s.phone}
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </div>
                  )}
                  {s.instagram && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Instagram className="h-3.5 w-3.5" />
                      {s.instagram}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === "list" && suppliers.length > 0 && (
        <div className="rounded-lg border overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs">
                <SortableHeader<Supplier> col="name" label="Nome" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-medium" />
                <SortableHeader<Supplier> col="category" label="Categoria" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-medium" />
                <SortableHeader<Supplier> col="city" label="Cidade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-medium" />
                <th className="px-4 py-3 text-left font-medium">Telefone</th>
                <SortableHeader<Supplier> col="rating" label="Avaliação" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-medium" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr
                  key={s.id}
                  className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                  onClick={() => openDetail(s)}
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {s.name}
                      <PendingTasksBadge entityType="supplier" entityId={s.id} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.category ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.city ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StarRating rating={s.rating} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Editar"
                        onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                      >
                        <Plus className="h-3.5 w-3.5 rotate-45" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label="Excluir"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(s); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SupplierForm
        open={formOpen}
        onOpenChange={setFormOpen}
        supplier={editing}
        onSaved={() => void refresh()}
      />

      <SupplierDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        supplierId={detailId}
        onEdit={(s) => {
          setEditing(s);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
