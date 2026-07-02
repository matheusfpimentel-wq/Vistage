import { useEffect, useState } from "react";
import { Loader2, Music } from "lucide-react";
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
import { RoyaltyImportDialog } from "./RoyaltyImportDialog";
import {
  createTransaction,
  listCategories,
  updateTransaction,
} from "../api";
import { getDb } from "@/lib/db";
import {
  CURRENCIES,
  EXPENSE_TYPES,
  PAYMENT_METHODS,
  currencySymbol,
  defaultStatus,
  statusesForKind,
  type FinanceCategory,
  type FinanceTransaction,
  type FinanceTransactionCreateInput,
  type TransactionKind,
} from "../types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { listClasses, type ClassWithStudent } from "@/modules/classes/api";
import { formatCurrency, todayISO } from "@/lib/format";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";

/** Arredonda para centavos (2 casas) — evita ruído de ponto flutuante no BRL. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: FinanceTransaction | null;
  defaultKind?: TransactionKind;
  onSaved: () => void;
};

// O formulário sempre inicializa os campos de moeda (emptyState/txToState), então
// os tratamos como obrigatórios aqui — ainda que sejam opcionais na criação.
type FormState = FinanceTransactionCreateInput & {
  currency: string;
  original_amount: number | null;
  exchange_rate: number | null;
};

function emptyState(kind: TransactionKind): FormState {
  return {
    kind,
    amount: 0,
    currency: "BRL",
    original_amount: null,
    exchange_rate: null,
    date: todayISO(),
    description: null,
    category_id: null,
    gig_id: null,
    contact_id: null,
    status: defaultStatus(kind),
    payment_method: null,
    expense_type: kind === "expense" ? "Variável" : null,
    receipt_file_path: null,
    tax_relevant: 0,
    recurring_id: null,
    student_package_id: null,
    track_id: null,
    class_id: null,
    party_id: null,
    music_cost_id: null,
    gig_sync: 0,
    class_sync: 0,
  };
}

function txToState(t: FinanceTransaction): FormState {
  return {
    kind: t.kind,
    amount: t.amount,
    currency: t.currency ?? "BRL",
    original_amount: t.original_amount ?? null,
    exchange_rate: t.exchange_rate ?? null,
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
    student_package_id: t.student_package_id ?? null,
    track_id: t.track_id ?? null,
    class_id: t.class_id ?? null,
    party_id: t.party_id ?? null,
    music_cost_id: t.music_cost_id ?? null,
    gig_sync: t.gig_sync ?? 0,
    class_sync: t.class_sync ?? 0,
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
  const [royaltyOpen, setRoyaltyOpen] = useState(false);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [classes, setClasses] = useState<ClassWithStudent[]>([]);
  const [gigHasSyncedTx, setGigHasSyncedTx] = useState(false);

  useEffect(() => {
    if (!state.gig_id || state.gig_sync === 1) { setGigHasSyncedTx(false); return; }
    void (async () => {
      const db = getDb();
      const rows = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM finance_transactions WHERE gig_id = $1 AND gig_sync = 1 AND kind = 'income'${transaction ? ` AND id != ${transaction.id}` : ""}`,
        [state.gig_id]
      );
      setGigHasSyncedTx((rows[0]?.n ?? 0) > 0);
    })();
  }, [state.gig_id, state.gig_sync, transaction]);
  const [errors, setErrors] = useState<{ amount?: string; date?: string; rate?: string }>({});
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
    void listClasses().then(setClasses);
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  // Multi-moeda: `amount` é SEMPRE em BRL. Em moeda estrangeira, o usuário digita
  // o valor original + a cotação, e o BRL é recalculado (original × cotação).
  function changeCurrency(cur: string) {
    setState((s) => {
      if (cur === "BRL") {
        // Volta pra BRL: mantém o equivalente já calculado em `amount`.
        return { ...s, currency: "BRL", original_amount: null, exchange_rate: null };
      }
      const orig = s.original_amount ?? (s.amount || null);
      const rate = s.exchange_rate ?? 1;
      const amt = orig != null ? round2(orig * rate) : 0;
      return { ...s, currency: cur, original_amount: orig, exchange_rate: rate, amount: amt };
    });
    setDirty(true);
  }

  function setForeignAmount(orig: number | null) {
    setState((s) => {
      const rate = s.exchange_rate ?? 0;
      const amt = orig != null ? round2(orig * rate) : 0;
      return { ...s, original_amount: orig, amount: amt };
    });
    setDirty(true);
  }

  function setRate(rate: number | null) {
    setState((s) => {
      const orig = s.original_amount ?? 0;
      const amt = rate != null ? round2(orig * rate) : 0;
      return { ...s, exchange_rate: rate, amount: amt };
    });
    setDirty(true);
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!state.date) e.date = "Obrigatório";
    const foreign = state.currency !== "BRL";
    if (foreign) {
      if (!state.original_amount || state.original_amount <= 0)
        e.amount = "Valor deve ser maior que zero";
      if (!state.exchange_rate || state.exchange_rate <= 0)
        e.rate = "Informe a cotação";
    } else if (!state.amount || state.amount <= 0) {
      e.amount = "Valor deve ser maior que zero";
    }
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
  const isForeign = state.currency !== "BRL";
  const sym = currencySymbol(state.currency);
  const isLocked = state.gig_sync === 1 || state.class_sync === 1;
  const lockedSource = state.gig_sync === 1 ? "GIG" : "aula";
  const selectedCategoryName = categories.find((c) => c.id === state.category_id)?.name ?? "";
  const isAulaCategory = selectedCategoryName === "Aulas / Mentorias";
  const isRoyaltiesCategory = selectedCategoryName === "Royalties";

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>
            {transaction
              ? `Editar ${state.kind === "income" ? "receita" : "despesa"}`
              : `Nova ${state.kind === "income" ? "receita" : "despesa"}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {(isLocked || state.party_id) && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {isLocked
                ? `Este lançamento é sincronizado automaticamente pela ${lockedSource} vinculada. Para alterar valores, edite a ${lockedSource}.`
                : "Este lançamento é sincronizado automaticamente pela festa vinculada. Para alterar valores, edite a festa."}
            </div>
          )}
          {!transaction && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set("kind", "income")}
                disabled={isLocked}
                className={`flex-1 rounded-md border p-2 text-sm transition ${
                  state.kind === "income"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                    : "border-input"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Entrada (receita)
              </button>
              <button
                type="button"
                onClick={() => {
                  set("kind", "expense");
                  if (!state.expense_type) set("expense_type", "Variável");
                }}
                disabled={isLocked}
                className={`flex-1 rounded-md border p-2 text-sm transition ${
                  state.kind === "expense"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-input"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Saída (despesa)
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Moeda">
              <Select
                value={state.currency}
                onValueChange={changeCurrency}
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} · {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data" required error={errors.date}>
              <Input
                type="date"
                value={state.date}
                onChange={(e) => set("date", e.target.value)}
                disabled={isLocked}
                title={isLocked ? `Data definida pela ${lockedSource}` : undefined}
              />
            </Field>
          </div>

          {isForeign ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={`Valor (${sym})`} required error={errors.amount}>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={state.original_amount || ""}
                  onChange={(e) =>
                    setForeignAmount(parseFloat(e.target.value) || null)
                  }
                  disabled={isLocked}
                />
              </Field>
              <Field label={`Cotação (${sym} → R$)`} error={errors.rate}>
                <Input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={state.exchange_rate ?? ""}
                  onChange={(e) => setRate(parseFloat(e.target.value) || null)}
                  disabled={isLocked}
                  placeholder="ex.: 5,40"
                />
              </Field>
              <Field label="Equivale a (R$)">
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums">
                  {formatCurrency(state.amount)}
                </div>
              </Field>
            </div>
          ) : (
            <Field label="Valor (R$)" required error={errors.amount}>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={state.amount || ""}
                onChange={(e) => set("amount", parseFloat(e.target.value) || 0)}
                disabled={isLocked}
              />
            </Field>
          )}

          <Field label="Descrição">
            <Textarea
              rows={2}
              value={state.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
              disabled={isLocked}
              title={isLocked ? `Descrição gerada automaticamente pela ${lockedSource}` : undefined}
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

          {/* Importação de royalties mora aqui agora (saiu da barra de ações):
              aparece assim que a categoria vira "Royalties" num lançamento novo. */}
          {!transaction && isRoyaltiesCategory && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Tem relatório do DistroKid ou Beatport? Importe de uma vez: cada
                faixa vira uma receita por mês, já convertida pra BRL.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setRoyaltyOpen(true)}
              >
                <Music className="h-3.5 w-3.5" /> Importar
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={state.status}
                onValueChange={(v) =>
                  set("status", v as FormState["status"])
                }
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusesForKind(state.kind).map((s) => (
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
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
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

          {gigHasSyncedTx && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
              Atenção: essa GIG já tem uma receita gerada automaticamente. Criar outra aqui pode duplicar o lançamento.
            </div>
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
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
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
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isAulaCategory && (
            <Field label="Vincular a uma aula">
              <Select
                value={state.class_id?.toString() ?? "none"}
                onValueChange={(v) =>
                  set("class_id", v === "none" ? null : Number(v))
                }
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.date} · {c.student_name ?? `Aula #${c.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

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

    {/* Importação de royalties dispara o mesmo fluxo de antes; ao concluir,
        atualiza a lista e fecha o lançamento manual (já criou as receitas). */}
    <RoyaltyImportDialog
      open={royaltyOpen}
      onOpenChange={setRoyaltyOpen}
      onImported={() => {
        onSaved();
        onOpenChange(false);
      }}
    />
    </>
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
