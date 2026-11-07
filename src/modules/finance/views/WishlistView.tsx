import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
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
import { InfoHint } from "@/components/ui/tooltip";
import { UrgencyMark } from "@/components/ui/urgency-mark";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { useUnsavedConfirm } from "@/lib/dirty";
import { EMPTY_VALUE, formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { createWish, deleteWish, listWishes, updateWish } from "../api";
import {
  WISHLIST_PRIORITIES,
  WISHLIST_STATUSES,
  type Equipment,
  type EquipmentWish,
  type WishlistPriority,
  type WishlistStatus,
} from "../types";

const PRIORITY_VARIANT: Record<WishlistPriority, "warning" | "secondary" | "outline"> = {
  Alta: "warning",
  Média: "secondary",
  Baixa: "outline",
};

const STATUS_VARIANT: Record<WishlistStatus, "success" | "secondary" | "outline"> = {
  Desejado: "outline",
  Comprado: "success",
  Descartado: "secondary",
};

type FormState = {
  name: string;
  category: string;
  estimated_value: string;
  priority: WishlistPriority;
  target_date: string;
  link: string;
  notes: string;
  saved_amount: string;
  status: WishlistStatus;
};

const EMPTY_FORM: FormState = {
  name: "",
  category: "",
  estimated_value: "",
  priority: "Média",
  target_date: "",
  link: "",
  notes: "",
  saved_amount: "",
  status: "Desejado",
};

/**
 * Desejos: o que se QUER comprar, antes de o dinheiro sair. Fica ao lado da
 * lista de itens porque é a mesma decisão vista de dois lados — o que eu tenho
 * e o que eu quero ter.
 *
 * `onBuy` sobe pro pai, que abre o formulário de item de Patrimônio já
 * preenchido. O formulário NÃO é duplicado aqui: é o mesmo da aba Itens.
 */
export function WishlistView({
  onBuy,
  equipmentById,
}: {
  onBuy: (wish: EquipmentWish) => void;
  equipmentById: Map<number, Equipment>;
}) {
  const [wishes, setWishes] = useState<EquipmentWish[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentWish | null>(null);
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(wishes);

  async function refresh() {
    setWishes(await listWishes());
  }

  // Recarrega no mount, e isso basta: o TabsContent do Radix DESMONTA a aba
  // inativa, então voltar de "Itens" (depois de converter um desejo em item)
  // monta esta view de novo e relê a lista. Prop de "recarregue agora" seria
  // peso morto — ela nunca chegaria aqui com a aba fechada.
  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(w: EquipmentWish) {
    // Exclusão TRIVIAL (§9): a linha não tem filhos, e o item de Patrimônio
    // gerado continua existindo — apagar o desejo não cascateia em nada.
    await deleteWithUndo({
      label: "Desejo",
      remove: () => deleteWish(w.id),
      restore: async () => {
        await createWish({
          name: w.name,
          category: w.category,
          estimated_value: w.estimated_value,
          priority: w.priority,
          target_date: w.target_date,
          link: w.link,
          notes: w.notes,
          saved_amount: w.saved_amount,
          status: w.status,
          equipment_id: w.equipment_id,
          purchased_at: w.purchased_at,
        });
      },
      onChange: refresh,
    });
  }

  /** Volta o desejo pra fila. Não mexe no item de Patrimônio já criado. */
  async function handleReopen(w: EquipmentWish) {
    await updateWish({ id: w.id, status: "Desejado", purchased_at: null });
    await refresh();
    toast.success("Desejo reaberto");
  }

  // Sugestões vindas das DUAS listas: a categoria que o item de Patrimônio já
  // usa serve pro desejo, e vice-versa.
  const categorySuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...[...equipmentById.values()].map((e) => e.category),
            ...wishes.map((w) => w.category),
          ].filter(Boolean) as string[]
        )
      ),
    [equipmentById, wishes]
  );

  const totals = useMemo(() => {
    let estimated = 0;
    let saved = 0;
    let pending = 0;
    for (const w of wishes) {
      if (w.status !== "Desejado") continue;
      pending++;
      estimated += w.estimated_value ?? 0;
      saved += w.saved_amount;
    }
    return { estimated, saved, pending };
  }, [wishes]);

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
          <Plus className="h-4 w-4" /> Novo desejo
        </Button>
      </div>

      {totals.pending > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-xs text-muted-foreground">Na fila</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{totals.pending}</div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-xs text-muted-foreground">Custo estimado</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">
              {formatCurrency(totals.estimated)}
            </div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              Já separado
              <InfoHint>
                Anotação sua de quanto já guardou pra essas compras. Não é
                lançamento: nada disso aparece nos totais do Financeiro, que
                segue sendo a fonte única de dinheiro.
              </InfoHint>
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">
              {formatCurrency(totals.saved)}
            </div>
          </div>
        </div>
      )}

      {wishes.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhum desejo na lista. É aqui que entra o que você quer comprar antes
          de comprar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortableHeader<EquipmentWish> col="name" label="Item" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<EquipmentWish> col="priority" label="Prioridade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<EquipmentWish> col="estimated_value" label="Estimado" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
                <SortableHeader<EquipmentWish> col="saved_amount" label="Separado" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
                <SortableHeader<EquipmentWish> col="target_date" label="Prazo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <SortableHeader<EquipmentWish> col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left" />
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => {
                const bought = w.status === "Comprado";
                const linked = w.equipment_id != null ? equipmentById.get(w.equipment_id) : undefined;
                return (
                  <tr
                    key={w.id}
                    className={cn(
                      "cursor-pointer border-t transition-colors hover:bg-muted/40",
                      w.status !== "Desejado" && "text-muted-foreground"
                    )}
                    onClick={() => {
                      setEditing(w);
                      setOpen(true);
                    }}
                    title="Clique pra editar"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{w.name}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {w.category && <span>{w.category}</span>}
                        {w.notes && <span>{w.notes}</span>}
                        {linked && <span>virou "{linked.name}"</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={PRIORITY_VARIANT[w.priority]}>{w.priority}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {w.estimated_value == null ? (
                        <span className="text-muted-foreground">{EMPTY_VALUE}</span>
                      ) : (
                        formatCurrency(w.estimated_value)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {w.saved_amount > 0 ? formatCurrency(w.saved_amount) : (
                        <span className="text-muted-foreground">{EMPTY_VALUE}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {w.target_date ? (
                        <UrgencyMark
                          date={w.target_date}
                          kind="deadline"
                          // Desejo fechado não tem prazo pendente: não pinta.
                          level={w.status === "Desejado" ? undefined : null}
                          label={formatDate(w.target_date)}
                        />
                      ) : (
                        <span className="text-muted-foreground">{EMPTY_VALUE}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[w.status]}>{w.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {w.link && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => window.open(w.link!, "_blank")}
                            aria-label="Abrir link"
                            title="Abrir link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {bought ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleReopen(w)}
                            aria-label="Reabrir"
                            title="Voltar pra fila"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onBuy(w)}
                            title="Cadastrar no Patrimônio a partir deste desejo"
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Comprei
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(w);
                            setOpen(true);
                          }}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(w)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WishForm
        open={open}
        onOpenChange={setOpen}
        wish={editing}
        categorySuggestions={categorySuggestions}
        onSaved={refresh}
      />
    </div>
  );
}

function WishForm({
  open,
  onOpenChange,
  wish,
  categorySuggestions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wish: EquipmentWish | null;
  categorySuggestions: string[];
  onSaved: () => void;
}) {
  const [state, setState] = useState<FormState>(EMPTY_FORM);
  const openedWith = useRef<FormState>(EMPTY_FORM);
  const dirty = JSON.stringify(state) !== JSON.stringify(openedWith.current);

  useEffect(() => {
    const base: FormState = wish
      ? {
          name: wish.name,
          category: wish.category ?? "",
          estimated_value: wish.estimated_value?.toString() ?? "",
          priority: wish.priority,
          target_date: wish.target_date ?? "",
          link: wish.link ?? "",
          notes: wish.notes ?? "",
          saved_amount: wish.saved_amount ? String(wish.saved_amount) : "",
          status: wish.status,
        }
      : EMPTY_FORM;
    setState(base);
    openedWith.current = base;
  }, [wish, open]);

  const confirmClose = useUnsavedConfirm(dirty);

  async function handleSubmit() {
    if (!state.name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    const payload = {
      name: state.name.trim(),
      category: state.category || null,
      estimated_value: state.estimated_value ? parseFloat(state.estimated_value) : null,
      priority: state.priority,
      target_date: state.target_date || null,
      link: state.link.trim() || null,
      notes: state.notes || null,
      saved_amount: state.saved_amount ? parseFloat(state.saved_amount) : 0,
      status: state.status,
    };
    try {
      if (wish) await updateWish({ id: wish.id, ...payload });
      else await createWish(payload);
      toast.success("Salvo");
      onSaved();
      openedWith.current = state;
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{wish ? "Editar desejo" : "Novo desejo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              O que você quer <span className="text-destructive">*</span>
            </Label>
            <Input
              value={state.name}
              placeholder="Ex: CDJ-3000, monitor de estúdio…"
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                list="wish-categories"
                placeholder="Ex: Controladora, Caixa…"
                value={state.category}
                onChange={(e) => setState((s) => ({ ...s, category: e.target.value }))}
              />
              <datalist id="wish-categories">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={state.priority}
                onValueChange={(v) => setState((s) => ({ ...s, priority: v as WishlistPriority }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WISHLIST_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor estimado (R$)</Label>
              <Input
                type="number"
                step={0.01}
                value={state.estimated_value}
                onChange={(e) => setState((s) => ({ ...s, estimated_value: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Já separado (R$)</Label>
                <InfoHint>
                  Anotação de quanto você já guardou pra esta compra. Não gera
                  lançamento nem entra nos totais do Financeiro.
                </InfoHint>
              </div>
              <Input
                type="number"
                step={0.01}
                placeholder="Opcional"
                value={state.saved_amount}
                onChange={(e) => setState((s) => ({ ...s, saved_amount: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Prazo desejado</Label>
                <InfoHint>
                  Quando você quer ter comprado. Só serve pra ordenar e avisar
                  que está chegando — nada acontece automaticamente na data.
                </InfoHint>
              </div>
              <Input
                type="date"
                value={state.target_date}
                onChange={(e) => setState((s) => ({ ...s, target_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={state.status}
                onValueChange={(v) => setState((s) => ({ ...s, status: v as WishlistStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WISHLIST_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Link</Label>
            <Input
              placeholder="https://…"
              value={state.link}
              onChange={(e) => setState((s) => ({ ...s, link: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <AutoGrowTextarea
              rows={2}
              value={state.notes}
              onChange={(v) => setState((s) => ({ ...s, notes: v }))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => confirmClose(false, () => onOpenChange(false))}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
