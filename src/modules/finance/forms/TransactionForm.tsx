import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "@/components/ui/toaster";
import { CategorySelect } from "../components/CategorySelect";
import {
  createTransaction,
  listCategories,
  updateTransaction,
} from "../api";
import {
  EXPENSE_TYPES,
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  type FinanceCategory,
  type FinanceTransaction,
  type FinanceTransactionCreateInput,
  type TransactionKind,
} from "../types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { todayISO } from "@/lib/format";
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: FinanceTransaction | null;
  defaultKind?: TransactionKind;
  onSaved: () => void;
};

type FormState = FinanceTransactionCreateInput;

function emptyState(kind: TransactionKind): FormState {
  return {
    kind,
    amount: 0,
    date: todayISO(),
    description: null,
    category_id: null,
    gig_id: null,
    contact_id: null,
    status: "Recebido/Pago",
    payment_method: null,
    expense_type: kind === "expense" ? "Variável" : null,
    receipt_file_path: null,
    tax_relevant: 0,
    recurring_id: null,
  };
}

function txToState(t: FinanceTransaction): FormState {
  return {
    kind: t.kind,
    amount: t.amount,
    date: t.date,
    description: t.description,
    category_id: t.category_id,
    gig_id: t.gig_id,
    contact_id: t.contact_id,
    status: t.status,
    payment_method: t.payment_method,
    expense_type: t.expense_type,
    receipt_file_path: t.receipt_file_path,
    tax_relevant: t.tax_relevant,
    recurring_id: t.recurring_id,
  };
}

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  defaultKind = "income",
  onSaved,
}: Props) {
  const [state, setState] = useState<FormState>(emptyState(defaultKind));
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (transaction) setState(txToState(transaction));
    else setState(emptyState(defaultKind));
    setErrors({});
    setDirty(false);
  }, [transaction, defaultKind, open]);

  async function refreshCategories() {
    setCategories(await listCategories());
  }

  useEffect(() => {
    if (!open) return;
    void refreshCategories();
    void listGigs().then(setGigs);
    void listContacts().then(setContacts);
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!state.date) e.date = "Obrigatório";
    if (!state.amount || state.amount <= 0) e.amount = "Valor deve ser maior que zero";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      if (transaction) {
        await updateTransaction({ id: transaction.id, ...state });
        toast.success("Transação atualizada");
      } else {
        await createTransaction(state);
        toast.success("Transação criada");
      }
      setDirty(false);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const isExpense = state.kind === "expense";

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {transaction
              ? `Editar ${state.kind === "income" ? "receita" : "despesa"}`
              : `Nova ${state.kind === "income" ? "receita" : "despesa"}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!transaction && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set("kind", "income")}
                className={`flex-1 rounded-md border p-2 text-sm transition ${
                  state.kind === "income"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                    : "border-input"
                }`}
              >
                Entrada (receita)
              </button>
              <button
                type="button"
                onClick={() => {
                  set("kind", "expense");
                  if (!state.expense_type) set("expense_type", "Variável");
                }}
                className={`flex-1 rounded-md border p-2 text-sm transition ${
                  state.kind === "expense"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-input"
                }`}
              >
                Saída (despesa)
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valor (R$)" required error={errors.amount}>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={state.amount || ""}
                onChange={(e) =>
                  set("amount", parseFloat(e.target.value) || 0)
                }
              />
            </Field>
            <Field label="Data" required error={errors.date}>
              <Input
                type="date"
                value={state.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Descrição">
            <Textarea
              rows={2}
              value={state.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
            />
          </Field>

          <Field label="Categoria">
            <CategorySelect
              kind={state.kind}
              categories={categories}
              value={state.category_id}
              onChange={(id) => set("category_id", id)}
              onCategoriesChange={refreshCategories}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={state.status}
                onValueChange={(v) =>
                  set("status", v as FormState["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Forma de pagamento">
              <Select
                value={state.payment_method ?? "none"}
                onValueChange={(v) =>
                  set(
                    "payment_method",
                    v === "none" ? null : (v as FormState["payment_method"])
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isExpense && (
            <Field label="Tipo de despesa">
              <Select
                value={state.expense_type ?? "Variável"}
                onValueChange={(v) =>
                  set("expense_type", v as FormState["expense_type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                      {t === "Fixa" ? " (recorrente mensal)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Vincular a uma GIG">
              <Select
                value={state.gig_id?.toString() ?? "none"}
                onValueChange={(v) =>
                  set("gig_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem vínculo —</SelectItem>
                  {gigs.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.venue_name} · {g.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vincular a um contato">
              <Select
                value={state.contact_id?.toString() ?? "none"}
                onValueChange={(v) =>
                  set("contact_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem vínculo —</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.tax_relevant === 1}
              onChange={(e) => set("tax_relevant", e.target.checked ? 1 : 0)}
              className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
            />
            Considerar no imposto
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {transaction ? "Salvar alterações" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
