import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  async function refresh() {
    setItems(await listEquipment());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(eq: Equipment) {
    if (!window.confirm(`Excluir "${eq.name}" do patrimônio?`)) return;
    await deleteEquipment(eq.id);
    await refresh();
    toast.success("Item excluído");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Itens criados automaticamente a partir de despesas na categoria
          <Badge variant="outline" className="mx-1">Equipamentos</Badge>
          — você também pode adicionar manualmente abaixo.
        </p>
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
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Compra</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-left">Localização</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  className="border-t transition-colors hover:bg-muted/40"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.name}</div>
                    {it.notes && (
                      <div className="text-xs text-muted-foreground">{it.notes}</div>
                    )}
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
                    <div className="flex justify-end gap-1">
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
      />
    </div>
  );
}

function EquipmentForm({
  open,
  onOpenChange,
  equipment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  onSaved: () => void;
}) {
  const [state, setState] = useState({
    name: "",
    purchase_date: "" as string,
    purchase_value: "" as string,
    eq_state: "Em uso" as EquipmentState,
    location: "",
    notes: "",
  });

  useEffect(() => {
    if (equipment) {
      setState({
        name: equipment.name,
        purchase_date: equipment.purchase_date ?? "",
        purchase_value: equipment.purchase_value?.toString() ?? "",
        eq_state: equipment.state,
        location: equipment.location ?? "",
        notes: equipment.notes ?? "",
      });
    } else {
      setState({
        name: "",
        purchase_date: "",
        purchase_value: "",
        eq_state: "Em uso",
        location: "",
        notes: "",
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
      purchase_value: state.purchase_value
        ? parseFloat(state.purchase_value)
        : null,
      state: state.eq_state,
      location: state.location || null,
      notes: state.notes || null,
      transaction_id: equipment?.transaction_id ?? null,
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
