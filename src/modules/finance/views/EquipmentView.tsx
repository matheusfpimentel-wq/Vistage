import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  createEquipment,
  deleteEquipment,
  listEquipment,
  updateEquipment,
} from "../api";
import {
  EQUIPMENT_STATES,
  type Equipment,
  type EquipmentState,
} from "../types";
import { formatCurrency, formatDate } from "@/lib/format";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";

const STATE_VARIANT: Record<
  EquipmentState,
  "success" | "destructive" | "warning" | "secondary"
> = {
  "Em uso": "success",
  Vendido: "secondary",
  Quebrado: "destructive",
  Estoque: "warning",
};

export function EquipmentView() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(items);

  async function refresh() {
    setItems(await listEquipment());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(eq: Equipment) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir "${eq.name}" do patrimônio?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteEquipment(eq.id);
    await refresh();
    toast.success("Item excluído");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Sem itens no patrimônio.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortableHeader<Equipment> col="name" label="Item" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Equipment> col="state" label="Estado" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Equipment> col="purchase_date" label="Compra" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<Equipment> col="purchase_value" label="Valor" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
                <SortableHeader<Equipment> col="location" label="Localização" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((it) => (
                <tr
                  key={it.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                  onClick={() => {
                    setEditing(it);
                    setOpen(true);
                  }}
                  title="Clique pra editar"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {it.category && <span>{it.category}</span>}
                      {it.quantity > 1 && <span>× {it.quantity}</span>}
                      {it.notes && <span>{it.notes}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATE_VARIANT[it.state]}>{it.state}</Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {it.purchase_date ? formatDate(it.purchase_date) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(it.purchase_value)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {it.location ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(it);
                          setOpen(true);
                        }}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(it)}
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

      <EquipmentForm
        open={open}
        onOpenChange={setOpen}
        equipment={editing}
        onSaved={refresh}
        allItems={items}
      />
    </div>
  );
}

function EquipmentForm({
  open,
  onOpenChange,
  equipment,
  onSaved,
  allItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  onSaved: () => void;
  allItems: Equipment[];
}) {
  const [state, setState] = useState({
    name: "",
    purchase_date: "" as string,
    purchase_value: "" as string,
    eq_state: "Em uso" as EquipmentState,
    location: "",
    notes: "",
    quantity: "1",
    category: "",
    photo_path: null as string | null,
  });

  const categorySuggestions = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.category).filter(Boolean) as string[])),
    [allItems]
  );

  useEffect(() => {
    if (equipment) {
      setState({
        name: equipment.name,
        purchase_date: equipment.purchase_date ?? "",
        purchase_value: equipment.purchase_value?.toString() ?? "",
        eq_state: equipment.state,
        location: equipment.location ?? "",
        notes: equipment.notes ?? "",
        quantity: String(equipment.quantity ?? 1),
        category: equipment.category ?? "",
        photo_path: equipment.photo_path ?? null,
      });
    } else {
      setState({
        name: "",
        purchase_date: "",
        purchase_value: "",
        eq_state: "Em uso",
        location: "",
        notes: "",
        quantity: "1",
        category: "",
        photo_path: null,
      });
    }
  }, [equipment, open]);

  async function handleSubmit() {
    if (!state.name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    const payload = {
      name: state.name.trim(),
      purchase_date: state.purchase_date || null,
      purchase_value: state.purchase_value ? parseFloat(state.purchase_value) : null,
      state: state.eq_state,
      location: state.location || null,
      notes: state.notes || null,
      transaction_id: equipment?.transaction_id ?? null,
      quantity: parseInt(state.quantity) || 1,
      category: state.category || null,
      photo_path: state.photo_path,
    };
    try {
      if (equipment) await updateEquipment({ id: equipment.id, ...payload });
      else await createEquipment(payload);
      toast.success("Salvo");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{equipment ? "Editar item" : "Novo item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome <span className="text-destructive">*</span></Label>
            <Input
              value={state.name}
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                list="eq-categories"
                placeholder="Ex: Controladora, Caixa, Cabo…"
                value={state.category}
                onChange={(e) => setState((s) => ({ ...s, category: e.target.value }))}
              />
              <datalist id="eq-categories">
                {categorySuggestions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={state.quantity}
                onChange={(e) => setState((s) => ({ ...s, quantity: e.target.value }))}
              />
            </div>
          </div>
          <AttachmentField
            label="Foto"
            subdir="equipment"
            variant="image"
            value={state.photo_path}
            onChange={(v) => setState((s) => ({ ...s, photo_path: v }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de compra</Label>
              <Input
                type="date"
                value={state.purchase_date}
                onChange={(e) =>
                  setState((s) => ({ ...s, purchase_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step={0.01}
                value={state.purchase_value}
                onChange={(e) =>
                  setState((s) => ({ ...s, purchase_value: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={state.eq_state}
                onValueChange={(v) =>
                  setState((s) => ({ ...s, eq_state: v as EquipmentState }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_STATES.map((es) => (
                    <SelectItem key={es} value={es}>
                      {es}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Localização</Label>
              <Input
                value={state.location}
                onChange={(e) =>
                  setState((s) => ({ ...s, location: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={state.notes}
              onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
