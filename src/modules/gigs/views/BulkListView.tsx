import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "../components/StatusBadge";
import { GIG_STATUSES, type Gig, type GigStatus } from "../types";
import { gigDisplayName } from "../displayName";
import { formatDate } from "@/lib/format";
import { updateGig } from "../api";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  onRefresh: () => void;
};

type Snapshot = { id: number; status: GigStatus }[];

export function BulkListView({ gigs, onEdit, onRefresh }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [applying, setApplying] = useState(false);
  const [newStatus, setNewStatus] = useState<GigStatus>("Confirmada");

  const allIds = gigs.map((g) => g.id);
  const allSelected = selected.size === allIds.length && allIds.length > 0;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (selected.size === 0) {
      toast.error("Nenhuma GIG selecionada");
      return;
    }
    const affected = gigs.filter((g) => selected.has(g.id));
    const prev: Snapshot = affected.map((g) => ({ id: g.id, status: g.status }));
    setApplying(true);
    try {
      await Promise.all(affected.map((g) => updateGig({ id: g.id, status: newStatus })));
      setSnapshot(prev);
      setSelected(new Set());
      onRefresh();
      toast.success(`${affected.length} GIG(s) atualizadas para "${newStatus}"`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo() {
    if (!snapshot) return;
    setApplying(true);
    try {
      await Promise.all(snapshot.map((s) => updateGig({ id: s.id, status: s.status })));
      setSnapshot(null);
      onRefresh();
      toast.success("Alteração desfeita");
    } catch (e) {
      toast.error(`Erro ao desfazer: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* barra de ações */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
        <span className="text-xs text-muted-foreground">
          {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
        </span>
        <Select value={newStatus} onValueChange={(v) => setNewStatus(v as GigStatus)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GIG_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={applyBulk} disabled={applying || selected.size === 0} className="h-8 text-xs">
          Aplicar status
        </Button>
        {snapshot && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleUndo}
            disabled={applying}
            className="h-8 gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Desfazer
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded"
                  aria-label="Selecionar todas"
                />
              </th>
              <th className="px-3 py-2 text-left">GIG</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {gigs.map((g) => (
              <tr key={g.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4 rounded"
                    aria-label={`Selecionar ${gigDisplayName(g)}`}
                  />
                </td>
                <td className="px-3 py-2 font-medium">{gigDisplayName(g)}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {g.date ? formatDate(g.date) : "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={g.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(g)}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {gigs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  Nenhuma GIG encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
