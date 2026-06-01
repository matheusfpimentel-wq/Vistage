import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, RotateCcw, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BUDGET_CATEGORIES,
  DEFAULT_STAGE_NAMES,
  STAGE_FIELD_DEFS,
  TICKET_TYPES,
  budgetSummary,
  partyStatusColor,
  ticketTypeLabel,
  type BudgetItemStatus,
  type PartyBudgetItem,
  type PartyDeserialized,
  type PartyStage,
  type PartyTask,
  type PartyTaskStatus,
  type PartyTicket,
  type StageStatus,
  type TicketType,
} from "./types";
import {
  createPartyBudgetItem,
  createPartyStage,
  createPartyTask,
  createPartyTicket,
  deletePartyBudgetItem,
  deletePartyStage,
  deletePartyTask,
  deletePartyTicket,
  initDefaultStages,
  listPartyBudgetItems,
  listPartyStages,
  listPartyTasks,
  listPartyTickets,
  syncPartyToFinanceiro,
  updatePartyBudgetItem,
  updatePartyStage,
  updatePartyTask,
  updatePartyTicket,
} from "./api";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: PartyDeserialized;
  onEdit: () => void;
  onRefresh: () => void;
};

export function PartyDetail({ open, onOpenChange, party, onEdit, onRefresh }: Props) {
  const navigate = useNavigate();

  const [stages, setStages] = useState<PartyStage[]>([]);
  const [budgetItems, setBudgetItems] = useState<PartyBudgetItem[]>([]);
  const [tickets, setTickets] = useState<PartyTicket[]>([]);
  const [tasks, setTasks] = useState<PartyTask[]>([]);

  const loadAll = useCallback(async () => {
    if (!open) return;
    await initDefaultStages(party.id);
    const [s, b, t, tk] = await Promise.all([
      listPartyStages(party.id),
      listPartyBudgetItems(party.id),
      listPartyTickets(party.id),
      listPartyTasks(party.id),
    ]);
    setStages(s);
    setBudgetItems(b);
    setTickets(t);
    setTasks(tk);
  }, [open, party.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{party.title}</DialogTitle>
            <Badge className={partyStatusColor(party.status)}>{party.status}</Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="workflow">
          <TabsList>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
            <TabsTrigger value="ingressos">Ingressos</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
            <TabsTrigger value="geral">Geral</TabsTrigger>
          </TabsList>

          <TabsContent value="workflow" className="pt-2">
            <WorkflowTab
              partyId={party.id}
              stages={stages}
              onReload={loadAll}
            />
          </TabsContent>

          <TabsContent value="orcamento" className="pt-2">
            <OrcamentoTab
              party={party}
              items={budgetItems}
              tickets={tickets}
              onReload={async () => { await loadAll(); onRefresh(); }}
            />
          </TabsContent>

          <TabsContent value="ingressos" className="pt-2">
            <IngressosTab
              partyId={party.id}
              tickets={tickets}
              onReload={loadAll}
            />
          </TabsContent>

          <TabsContent value="tarefas" className="pt-2">
            <TarefasTab
              partyId={party.id}
              stages={stages}
              tasks={tasks}
              onReload={loadAll}
            />
          </TabsContent>

          <TabsContent value="geral" className="pt-2">
            <GeralTab party={party} onEdit={onEdit} navigate={navigate} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ===== WORKFLOW TAB =====

function stageStatusColor(s: StageStatus) {
  return s === "concluida"
    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : s === "em_andamento"
    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
    : "bg-muted/40 text-muted-foreground border-border";
}

function stageStatusLabel(s: StageStatus) {
  return s === "concluida" ? "Concluída" : s === "em_andamento" ? "Em andamento" : "Pendente";
}

function WorkflowTab({
  partyId,
  stages,
  onReload,
}: {
  partyId: number;
  stages: PartyStage[];
  onReload: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string | number | null>>({});
  const [editNotes, setEditNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);

  function openStage(stage: PartyStage) {
    setExpandedId(stage.id);
    setEditFields({ ...stage.fields });
    setEditNotes(stage.notes ?? "");
  }

  async function saveStage(stage: PartyStage) {
    setSaving(true);
    try {
      await updatePartyStage(stage.id, { fields: editFields, notes: editNotes || null });
      await onReload();
      toast.success("Etapa salva");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(stage: PartyStage) {
    const next: StageStatus =
      stage.status === "pendente"
        ? "em_andamento"
        : stage.status === "em_andamento"
        ? "concluida"
        : "pendente";
    try {
      await updatePartyStage(stage.id, {
        status: next,
        completed_at: next === "concluida" ? new Date().toISOString() : null,
      });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleAddStage() {
    const name = newStageName.trim();
    if (!name) return;
    setAddingStage(true);
    try {
      const pos = stages.length;
      await createPartyStage(partyId, name, pos);
      setNewStageName("");
      await onReload();
      toast.success("Etapa adicionada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAddingStage(false);
    }
  }

  async function handleDeleteStage(id: number) {
    try {
      await deletePartyStage(id);
      if (expandedId === id) setExpandedId(null);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleRestoreDefaults() {
    setRestoringDefaults(true);
    try {
      for (const s of stages) {
        await deletePartyStage(s.id);
      }
      for (let i = 0; i < DEFAULT_STAGE_NAMES.length; i++) {
        await import("./api").then((m) =>
          m.createPartyStage(partyId, DEFAULT_STAGE_NAMES[i], i)
        );
      }
      setExpandedId(null);
      await onReload();
      toast.success("Etapas restauradas");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setRestoringDefaults(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={cn(
              "min-w-[140px] flex-1 rounded-lg border p-3 cursor-pointer transition",
              stageStatusColor(stage.status),
              expandedId === stage.id && "ring-2 ring-primary"
            )}
            onClick={() =>
              expandedId === stage.id ? setExpandedId(null) : openStage(stage)
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium truncate">{stage.name}</span>
              {expandedId === stage.id ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
            </div>
            <div className="mt-1 text-xs opacity-80">{stageStatusLabel(stage.status)}</div>
          </div>
        ))}
      </div>

      {expandedId !== null && (() => {
        const stage = stages.find((s) => s.id === expandedId);
        if (!stage) return null;
        const fieldDefs = STAGE_FIELD_DEFS[stage.name] ?? [];
        return (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{stage.name}</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleStatus(stage)}
                >
                  {stage.status === "concluida" ? (
                    <><RotateCcw className="h-3.5 w-3.5" /> Reabrir</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" /> {stage.status === "pendente" ? "Iniciar" : "Concluir"}</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDeleteStage(stage.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {fieldDefs.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldDefs.map((fd) => (
                  <div key={fd.key} className="space-y-1">
                    <Label className="text-xs">{fd.label}</Label>
                    {fd.type === "text" ? (
                      <Textarea
                        rows={2}
                        value={String(editFields[fd.key] ?? "")}
                        onChange={(e) =>
                          setEditFields((f) => ({ ...f, [fd.key]: e.target.value || null }))
                        }
                      />
                    ) : (
                      <Input
                        type={fd.type}
                        value={String(editFields[fd.key] ?? "")}
                        onChange={(e) =>
                          setEditFields((f) => ({
                            ...f,
                            [fd.key]:
                              fd.type === "number"
                                ? e.target.value ? Number(e.target.value) : null
                                : e.target.value || null,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Observações sobre esta etapa…"
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => void saveStage(stage)} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Input
          placeholder="Nome da nova etapa"
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          className="w-48"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAddStage();
          }}
        />
        <Button size="sm" variant="outline" onClick={() => void handleAddStage()} disabled={addingStage}>
          <Plus className="h-3.5 w-3.5" /> Adicionar etapa
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleRestoreDefaults()}
          disabled={restoringDefaults}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar etapas padrão
        </Button>
      </div>
    </div>
  );
}

// ===== ORÇAMENTO TAB =====

function OrcamentoTab({
  party,
  items,
  tickets,
  onReload,
}: {
  party: PartyDeserialized;
  items: PartyBudgetItem[];
  tickets: PartyTicket[];
  onReload: () => Promise<void>;
}) {
  const summary = budgetSummary(items);
  const [newCategory, setNewCategory] = useState(Object.keys(BUDGET_CATEGORIES)[0]);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProjected, setNewProjected] = useState("");
  const [newActual, setNewActual] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const subcats = BUDGET_CATEGORIES[newCategory] ?? [];

  async function handleAdd() {
    const projected = parseFloat(newProjected);
    if (isNaN(projected) || projected < 0) {
      toast.error("Informe um valor projetado válido");
      return;
    }
    setAdding(true);
    try {
      await createPartyBudgetItem({
        party_id: party.id,
        category: newCategory,
        subcategory: newSubcategory || null,
        description: newDesc.trim() || null,
        projected_amount: projected,
        actual_amount: newActual ? parseFloat(newActual) : null,
        supplier_note: newSupplier.trim() || null,
        status: "projetado",
        date_paid: null,
      });
      setNewDesc("");
      setNewProjected("");
      setNewActual("");
      setNewSupplier("");
      await onReload();
      toast.success("Item adicionado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePartyBudgetItem(id);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleStatusChange(id: number, status: BudgetItemStatus) {
    try {
      await updatePartyBudgetItem(id, { status });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncPartyToFinanceiro(party, tickets, items);
      await onReload();
      toast.success("Sincronizado com o Financeiro");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  const grouped = Object.keys(BUDGET_CATEGORIES).reduce<Record<string, PartyBudgetItem[]>>(
    (acc, cat) => {
      acc[cat] = items.filter((i) => i.category === cat);
      return acc;
    },
    {}
  );
  const uncategorized = items.filter(
    (i) => !Object.keys(BUDGET_CATEGORIES).includes(i.category)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Projetado</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{fmt(summary.projected)}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Real</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{fmt(summary.actual)}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Diferença</div>
          <div
            className={cn(
              "mt-1 text-lg font-semibold tabular-nums",
              summary.actual > summary.projected ? "text-red-400" : "text-emerald-400"
            )}
          >
            {fmt(summary.actual - summary.projected)}
          </div>
        </div>
      </div>

      {party.status === "Realizada" && party.financial_synced === 0 && (
        <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <span className="flex-1 text-sm text-amber-400">
            Festa realizada mas não sincronizada com o Financeiro.
          </span>
          <Button size="sm" onClick={() => void handleSync()} disabled={syncing}>
            {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sincronizar com Financeiro
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Subcategoria</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2 text-right">Projetado</th>
              <th className="px-3 py-2 text-right">Real</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum item de orçamento.
                </td>
              </tr>
            )}
            {([...Object.entries(grouped), uncategorized.length > 0 ? ["Outros", uncategorized] as [string, PartyBudgetItem[]] : null] as ([string, PartyBudgetItem[]] | null)[])
              .filter((x): x is [string, PartyBudgetItem[]] => x !== null)
              .flatMap(([, catItems]) =>
                (catItems as PartyBudgetItem[]).map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.category}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.subcategory ?? "—"}</td>
                    <td className="px-3 py-2">{item.description ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(item.projected_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.actual_amount != null ? fmt(item.actual_amount) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={item.status}
                        onValueChange={(v) => void handleStatusChange(item.id, v as BudgetItemStatus)}
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="projetado">Projetado</SelectItem>
                          <SelectItem value="confirmado">Confirmado</SelectItem>
                          <SelectItem value="pago">Pago</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.supplier_note ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Adicionar item</div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Select value={newCategory} onValueChange={(v) => { setNewCategory(v); setNewSubcategory(""); }}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {Object.keys(BUDGET_CATEGORIES).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newSubcategory} onValueChange={setNewSubcategory}>
            <SelectTrigger><SelectValue placeholder="Subcategoria" /></SelectTrigger>
            <SelectContent>
              {subcats.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Descrição"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="Projetado (R$)"
            value={newProjected}
            onChange={(e) => setNewProjected(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="Real (R$)"
            value={newActual}
            onChange={(e) => setNewActual(e.target.value)}
          />
          <Input
            placeholder="Fornecedor"
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
          />
          <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== INGRESSOS TAB =====

function IngressosTab({
  partyId,
  tickets,
  onReload,
}: {
  partyId: number;
  tickets: PartyTicket[];
  onReload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<TicketType>("antecipado");
  const [newPrice, setNewPrice] = useState("");
  const [newQtyTotal, setNewQtyTotal] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSold, setEditSold] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    const price = parseFloat(newPrice);
    if (!name || isNaN(price) || price < 0) {
      toast.error("Preencha nome e preço válidos");
      return;
    }
    setAdding(true);
    try {
      await createPartyTicket({
        party_id: partyId,
        name,
        ticket_type: newType,
        price,
        quantity_total: newQtyTotal ? parseInt(newQtyTotal) : null,
        quantity_sold: 0,
        sale_start_date: newStart || null,
        sale_end_date: newEnd || null,
        position: tickets.length,
      });
      setNewName("");
      setNewPrice("");
      setNewQtyTotal("");
      setNewStart("");
      setNewEnd("");
      await onReload();
      toast.success("Ingresso adicionado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePartyTicket(id);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleSaveSold(ticket: PartyTicket) {
    const sold = parseInt(editSold);
    if (isNaN(sold) || sold < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await updatePartyTicket(ticket.id, { quantity_sold: sold });
      setEditingId(null);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      {tickets.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          Nenhum ingresso cadastrado.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm">{t.name}</span>
                <Badge className="text-xs shrink-0">{ticketTypeLabel(t.ticket_type)}</Badge>
              </div>
              <div className="text-lg font-semibold tabular-nums">{fmt(t.price)}</div>
              <div className="text-xs text-muted-foreground">
                {editingId === t.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      className="h-6 w-20 text-xs"
                      value={editSold}
                      onChange={(e) => setEditSold(e.target.value)}
                    />
                    <Button size="sm" className="h-6 text-xs" onClick={() => void handleSaveSold(t)}>
                      OK
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>
                      ✕
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => { setEditingId(t.id); setEditSold(String(t.quantity_sold)); }}
                  >
                    {t.quantity_sold} / {t.quantity_total ?? "∞"} vendidos
                  </button>
                )}
              </div>
              {(t.sale_start_date || t.sale_end_date) && (
                <div className="text-xs text-muted-foreground">
                  {t.sale_start_date ? formatDate(t.sale_start_date) : "—"} →{" "}
                  {t.sale_end_date ? formatDate(t.sale_end_date) : "—"}
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Adicionar ingresso</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Nome do ingresso"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Select value={newType} onValueChange={(v) => setNewType(v as TicketType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TICKET_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ticketTypeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="Preço (R$)"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            placeholder="Quantidade total (opcional)"
            value={newQtyTotal}
            onChange={(e) => setNewQtyTotal(e.target.value)}
          />
          <Input
            type="date"
            placeholder="Início das vendas"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
          <Input
            type="date"
            placeholder="Fim das vendas"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
            <Plus className="h-3.5 w-3.5" /> Adicionar ingresso
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== TAREFAS TAB =====

const DEFAULT_TASKS_PER_STAGE: Record<string, string[]> = {
  "Ideação": ["Definir conceito e tema", "Pesquisar referências"],
  "Viabilidade": ["Pesquisar venues", "Calcular break-even", "Definir data"],
  "Marketing": ["Criar artes", "Planejar campanha", "Contratar designer"],
  "Execução": ["Fechar fornecedores", "Confirmar equipe", "Revisar rider técnico"],
  "Concretização": ["Fechar financeiro", "Registrar aprendizados"],
};

function taskStatusColor(s: PartyTaskStatus) {
  return s === "concluida"
    ? "line-through text-muted-foreground"
    : s === "em_andamento"
    ? "text-amber-400"
    : "";
}

function nextTaskStatus(s: PartyTaskStatus): PartyTaskStatus {
  return s === "pendente" ? "em_andamento" : s === "em_andamento" ? "concluida" : "pendente";
}

function TarefasTab({
  partyId,
  stages,
  tasks,
  onReload,
}: {
  partyId: number;
  stages: PartyStage[];
  tasks: PartyTask[];
  onReload: () => Promise<void>;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handleToggle(task: PartyTask) {
    try {
      await updatePartyTask(task.id, { status: nextTaskStatus(task.status) });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePartyTask(id);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await createPartyTask({
        party_id: partyId,
        stage_id: null,
        title,
        status: "pendente",
        priority: "Normal",
        due_date: null,
        notes: null,
      });
      setNewTitle("");
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleGenerateDefaults() {
    setGenerating(true);
    try {
      for (const stage of stages) {
        const stageTasks = DEFAULT_TASKS_PER_STAGE[stage.name] ?? [];
        for (const title of stageTasks) {
          await createPartyTask({
            party_id: partyId,
            stage_id: stage.id,
            title,
            status: "pendente",
            priority: "Normal",
            due_date: null,
            notes: null,
          });
        }
      }
      await onReload();
      toast.success("Tarefas geradas");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  const byStage = stages.map((stage) => ({
    stage,
    tasks: tasks.filter((t) => t.stage_id === stage.id),
  }));
  const noStage = tasks.filter((t) => t.stage_id === null);

  return (
    <div className="space-y-4">
      {byStage.map(({ stage, tasks: stageTasks }) => (
        <div key={stage.id}>
          <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {stage.name}
          </div>
          {stageTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-2">Sem tarefas nesta etapa.</p>
          ) : (
            <div className="space-y-1">
              {stageTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      ))}

      {noStage.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Sem etapa
          </div>
          <div className="space-y-1">
            {noStage.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && stages.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma tarefa.</p>
      )}

      <div className="flex items-center gap-2 border-t pt-3">
        <Input
          placeholder="Nova tarefa… (Enter para adicionar)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
          className="flex-1"
        />
        <Button size="sm" variant="outline" onClick={() => void handleAdd()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => void handleGenerateDefaults()} disabled={generating}>
          {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Gerar tarefas padrão
        </Button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: PartyTask;
  onToggle: (t: PartyTask) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <button
        type="button"
        onClick={() => void onToggle(task)}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
          task.status === "concluida"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : task.status === "em_andamento"
            ? "border-amber-500 bg-amber-500/20"
            : "border-input"
        )}
        title={`Status: ${task.status}`}
      >
        {task.status === "concluida" && <Check className="h-2.5 w-2.5" />}
        {task.status === "em_andamento" && <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
      </button>
      <span className={cn("flex-1 text-sm", taskStatusColor(task.status))}>
        {task.title}
      </span>
      {task.due_date && (
        <span className="text-xs text-muted-foreground">{formatDate(task.due_date)}</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive hover:text-destructive"
        onClick={() => void onDelete(task.id)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ===== GERAL TAB =====

function GeralTab({
  party,
  onEdit,
  navigate,
}: {
  party: PartyDeserialized;
  onEdit: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold">Informações gerais</h3>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 rounded-md border p-4">
        <InfoRow label="Título" value={party.title} />
        <InfoRow label="Status" value={party.status} />
        <InfoRow label="Data" value={party.date ? formatDate(party.date) : "—"} />
        <InfoRow label="Venue" value={party.venue_name ?? "—"} />
        <InfoRow
          label="Capacidade esperada"
          value={party.expected_capacity?.toLocaleString("pt-BR") ?? "—"}
        />
        <InfoRow
          label="Público real"
          value={party.actual_attendance?.toLocaleString("pt-BR") ?? "—"}
        />
        {party.lineup.length > 0 && (
          <InfoRow label="Lineup" value={`${party.lineup.length} DJ(s)`} />
        )}
        {party.sponsors.length > 0 && (
          <InfoRow
            label="Patrocinadores"
            value={party.sponsors.map((s) => s.name).join(", ")}
          />
        )}
      </div>

      {party.description && (
        <div className="rounded-md border p-4">
          <div className="text-xs text-muted-foreground mb-1">Descrição</div>
          <p className="text-sm whitespace-pre-wrap">{party.description}</p>
        </div>
      )}

      {party.notes && (
        <div className="rounded-md border p-4">
          <div className="text-xs text-muted-foreground mb-1">Notas</div>
          <p className="text-sm whitespace-pre-wrap">{party.notes}</p>
        </div>
      )}

      {party.venue_id && (
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => navigate("/venues")}
        >
          Ver no mapa →
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
