import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
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
import {
  createEquipment,
  deleteEquipment,
  listEquipment,
  markWishPurchased,
  updateEquipment,
} from "../api";
import {
  EQUIPMENT_STATES,
  type Equipment,
  type EquipmentState,
  type EquipmentWish,
} from "../types";
import { EMPTY_VALUE, formatCurrency, formatDate, todayISO } from "@/lib/format";
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { useUnsavedConfirm } from "@/lib/dirty";
import { clearDraft, readDraft, writeDraft } from "@/lib/formDraft";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModuleView } from "@/lib/moduleView";
import { WishlistView } from "./WishlistView";

const STATE_VARIANT: Record<
  EquipmentState,
  "success" | "destructive" | "warning" | "secondary"
> = {
  "Em uso": "success",
  Vendido: "secondary",
  Quebrado: "destructive",
  Estoque: "warning",
};

type FormState = {
  name: string;
  purchase_date: string;
  purchase_value: string;
  resale_value: string;
  eq_state: EquipmentState;
  location: string;
  notes: string;
  quantity: string;
  category: string;
  photo_path: string | null;
};

const EMPTY_FORM: FormState = {
  name: "",
  purchase_date: "",
  purchase_value: "",
  resale_value: "",
  eq_state: "Em uso",
  location: "",
  notes: "",
  quantity: "1",
  category: "",
  photo_path: null,
};

const DRAFT_KEY = "equipment.new";

export function EquipmentView() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Chave PRÓPRIA no useModuleView: "finance" já é a aba do módulo. Reusá-la
  // aqui faria a sub-aba sobrescrever a escolha de aba do Financeiro.
  const [tab, setTab] = useModuleView<string>("finance.equipment", "items");
  // Desejo que originou o cadastro em curso: ao salvar o item, ele é fechado
  // apontando pro id gerado.
  const [fromWish, setFromWish] = useState<EquipmentWish | null>(null);
  const [prefill, setPrefill] = useState<FormState | null>(null);
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(items);

  async function refresh() {
    setItems(await listEquipment());
  }

  const equipmentById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  /**
   * "Comprei": abre o formulário de item de Patrimônio JÁ PREENCHIDO com o que
   * o desejo sabe. O formulário é o mesmo da aba Itens — nada é duplicado. O
   * valor estimado entra como SUGESTÃO de valor de compra: é o que se
   * esperava pagar, e quase sempre não é o que se pagou, então fica editável e
   * visível em vez de ir escondido pro banco.
   */
  function handleBuy(wish: EquipmentWish) {
    setFromWish(wish);
    setPrefill({
      ...EMPTY_FORM,
      name: wish.name,
      category: wish.category ?? "",
      purchase_value: wish.estimated_value?.toString() ?? "",
      purchase_date: todayISO(),
      notes: wish.notes ?? "",
    });
    setEditing(null);
    setTab("items");
    setOpen(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Deep-link da busca global: ?sub=wishlist cai direto em Desejos. Mesmo
  // raciocínio do ?tab= no FinancePage — grava a preferência e limpa o
  // parâmetro. O FinancePage consome o ?tab= e deixa o ?sub= pra cá.
  useEffect(() => {
    const wanted = searchParams.get("sub");
    if (!wanted) return;
    setTab(wanted);
    const next = new URLSearchParams(searchParams);
    next.delete("sub");
    setSearchParams(next, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(eq: Equipment) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir "${eq.name}" do patrimônio?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteEquipment(eq.id);
    await refresh();
    toast.success("Item excluído");
  }

  // Totais. Não existia nenhum aqui antes.
  //
  // A diferença é calculada só sobre os itens que têm OS DOIS valores. Comparar
  // o investido TOTAL contra a soma das revendas estimadas daria um prejuízo
  // falso enquanto a maioria dos itens não tiver estimativa — o número pareceria
  // catastrófico por falta de dado, não por perda de valor.
  //
  // Também não multiplica por `quantity`: a coluna da tabela mostra o valor
  // cru, e um total que não fecha com a soma do que está na tela confunde mais
  // do que informa.
  const totals = useMemo(() => {
    let invested = 0;
    let resale = 0;
    let investedComparable = 0;
    let comparableCount = 0;
    for (const it of items) {
      invested += it.purchase_value ?? 0;
      if (it.resale_value != null) {
        resale += it.resale_value;
        investedComparable += it.purchase_value ?? 0;
        comparableCount++;
      }
    }
    return { invested, resale, delta: resale - investedComparable, comparableCount };
  }, [items]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="items">Itens</TabsTrigger>
        <TabsTrigger value="wishlist">Desejos</TabsTrigger>
      </TabsList>

      <TabsContent value="items" className="space-y-4">
        <div className="flex items-center justify-between">
          <div />
          <Button
            onClick={() => {
              setEditing(null);
              setPrefill(null);
              setFromWish(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Novo item
          </Button>
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">Total investido</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums">
                {formatCurrency(totals.invested)}
              </div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Revenda estimada
                <InfoHint>
                  Soma só dos itens que têm estimativa de revenda preenchida
                  ({totals.comparableCount} de {items.length}).
                </InfoHint>
              </div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums">
                {formatCurrency(totals.resale)}
              </div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Diferença
                <InfoHint>
                  Revenda estimada menos o que foi pago, comparando APENAS os
                  {" "}{totals.comparableCount} item(ns) que têm os dois valores. Incluir os
                  itens sem estimativa mostraria um prejuízo que é falta de dado,
                  não perda de valor.
                </InfoHint>
              </div>
              <div
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums",
                  totals.delta < 0 && "text-destructive"
                )}
              >
                {totals.comparableCount === 0 ? EMPTY_VALUE : formatCurrency(totals.delta)}
              </div>
            </div>
          </div>
        )}

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
                  <SortableHeader<Equipment> col="purchase_value" label="Valor de compra" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
                  <SortableHeader<Equipment> col="resale_value" label="Revenda" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
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
                      {it.purchase_date ? formatDate(it.purchase_date) : EMPTY_VALUE}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(it.purchase_value)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.resale_value == null ? (
                        <span className="text-muted-foreground">{EMPTY_VALUE}</span>
                      ) : (
                        <>
                          {formatCurrency(it.resale_value)}
                          {it.resale_updated_at && (
                            <div className="text-[11px] font-normal text-muted-foreground">
                              est. {formatDate(it.resale_updated_at)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {it.location ?? EMPTY_VALUE}
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

      </TabsContent>

      <TabsContent value="wishlist">
        <WishlistView onBuy={handleBuy} equipmentById={equipmentById} />
      </TabsContent>

      <EquipmentForm
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setPrefill(null);
            setFromWish(null);
          }
        }}
        equipment={editing}
        prefill={prefill}
        onSaved={refresh}
        onCreated={async (id) => {
          if (!fromWish) return;
          await markWishPurchased(fromWish.id, id);
          toast.success(`"${fromWish.name}" saiu dos desejos`);
        }}
        allItems={items}
      />
    </Tabs>
  );
}

function EquipmentForm({
  open,
  onOpenChange,
  equipment,
  prefill,
  onSaved,
  onCreated,
  allItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  /** Preenchimento inicial de um item NOVO (ex.: vindo de um desejo). */
  prefill?: FormState | null;
  onSaved: () => void;
  /** Chamado só na CRIAÇÃO, com o id gerado. */
  onCreated?: (id: number) => void | Promise<void>;
  allItems: Equipment[];
}) {
  const [state, setState] = useState<FormState>(EMPTY_FORM);
  // Snapshot do estado em que o formulário ABRIU. "Sujo" é a diferença contra
  // ele — assim editar um item e desfazer na mão não conta como alteração.
  const openedWith = useRef<FormState>(EMPTY_FORM);
  const [draftOffer, setDraftOffer] = useState<FormState | null>(null);
  const draftTimer = useRef<number | null>(null);

  const dirty = JSON.stringify(state) !== JSON.stringify(openedWith.current);

  const categorySuggestions = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.category).filter(Boolean) as string[])),
    [allItems]
  );

  useEffect(() => {
    const base: FormState = equipment
      ? {
          name: equipment.name,
          purchase_date: equipment.purchase_date ?? "",
          purchase_value: equipment.purchase_value?.toString() ?? "",
          resale_value: equipment.resale_value?.toString() ?? "",
          eq_state: equipment.state,
          location: equipment.location ?? "",
          notes: equipment.notes ?? "",
          quantity: String(equipment.quantity ?? 1),
          category: equipment.category ?? "",
          photo_path: equipment.photo_path ?? null,
        }
      : (prefill ?? EMPTY_FORM);
    setState(base);
    // O preenchimento inicial faz parte do estado em que o form ABRIU: sem
    // isso, um form recém-aberto a partir de um desejo já nasceria "sujo" e
    // pediria confirmação pra fechar sem o usuário ter digitado nada.
    openedWith.current = base;
    // Rascunho só vale pra item NOVO e SEM preenchimento inicial: num item
    // existente, restaurar valores antigos por cima de um registro que mudou
    // desde então faria mais mal que bem; e com prefill, oferecer um rascunho
    // de outro item por cima do desejo que está sendo convertido confunde. E
    // ele é OFERECIDO, não aplicado — aplicar sozinho surpreende.
    if (open && !equipment && !prefill) {
      const saved = readDraft<FormState>(DRAFT_KEY);
      setDraftOffer(saved && JSON.stringify(saved) !== JSON.stringify(EMPTY_FORM) ? saved : null);
    } else {
      setDraftOffer(null);
    }
  }, [equipment, open, prefill]);

  // Autosave do rascunho (1s depois da última tecla), só pra item novo em
  // branco: o preenchimento de uma conversão de desejo é daquele desejo, não
  // um rascunho genérico de "novo item".
  useEffect(() => {
    if (!open || equipment || prefill) return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    if (!dirty) return;
    draftTimer.current = window.setTimeout(() => writeDraft(DRAFT_KEY, state), 1000);
    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, [state, dirty, open, equipment, prefill]);

  /** Fecha de verdade: descarta o rascunho (a saída foi deliberada). */
  function discardAndClose() {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    if (!equipment && !prefill) clearDraft(DRAFT_KEY);
    onOpenChange(false);
  }

  const confirmClose = useUnsavedConfirm(dirty);

  async function handleSubmit() {
    if (!state.name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    const resaleValue = state.resale_value ? parseFloat(state.resale_value) : null;
    const payload = {
      name: state.name.trim(),
      purchase_date: state.purchase_date || null,
      purchase_value: state.purchase_value ? parseFloat(state.purchase_value) : null,
      resale_value: resaleValue,
      // Carimba a data da estimativa SOZINHO, só quando o valor de revenda
      // muda — pedir a data ao usuário seria um campo a mais pra errar, e o que
      // importa é saber se a estimativa está velha. Valor apagado limpa o
      // carimbo; valor inalterado preserva o carimbo antigo.
      resale_updated_at:
        resaleValue == null
          ? null
          : resaleValue === (equipment?.resale_value ?? null)
            ? (equipment?.resale_updated_at ?? todayISO())
            : todayISO(),
      state: state.eq_state,
      location: state.location || null,
      notes: state.notes || null,
      transaction_id: equipment?.transaction_id ?? null,
      quantity: parseInt(state.quantity) || 1,
      category: state.category || null,
      photo_path: state.photo_path,
    };
    try {
      if (equipment) {
        await updateEquipment({ id: equipment.id, ...payload });
      } else {
        const newId = await createEquipment(payload);
        // Fecha o desejo DEPOIS de o item existir: se o insert falhar, o
        // desejo continua na fila em vez de sumir sem item nenhum.
        await onCreated?.(newId);
      }
      toast.success("Salvo");
      onSaved();
      // Salvou → o rascunho cumpriu seu papel.
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      if (!equipment && !prefill) clearDraft(DRAFT_KEY);
      openedWith.current = state; // deixa de estar sujo antes de fechar
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => (v ? onOpenChange(true) : discardAndClose()))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{equipment ? "Editar item" : "Novo item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {draftOffer && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Você tinha um preenchimento não salvo
                {draftOffer.name.trim() ? ` ("${draftOffer.name.trim()}")` : ""}.
              </span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearDraft(DRAFT_KEY);
                    setDraftOffer(null);
                  }}
                >
                  Descartar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setState(draftOffer);
                    setDraftOffer(null);
                  }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Restaurar
                </Button>
              </div>
            </div>
          )}
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
              <Label>Valor de compra (R$)</Label>
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
              <div className="flex items-center gap-1">
                <Label>Valor de revenda (R$)</Label>
                <InfoHint>
                  Quanto você estima que o item valha hoje. Opcional. A data da
                  estimativa é carimbada sozinha quando você muda esse valor.
                </InfoHint>
              </div>
              <Input
                type="number"
                step={0.01}
                placeholder="Opcional"
                value={state.resale_value}
                onChange={(e) =>
                  setState((s) => ({ ...s, resale_value: e.target.value }))
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
            <AutoGrowTextarea
              rows={2}
              value={state.notes}
              onChange={(v) => setState((s) => ({ ...s, notes: v }))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => confirmClose(false, discardAndClose)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
