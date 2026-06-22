import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { SkeletonList } from "@/components/shared/Skeleton";
import { TransactionForm } from "./forms/TransactionForm";
import { CategoryManager } from "./forms/CategoryManager";
import { TransactionList } from "./views/TransactionList";
import { EquipmentView } from "./views/EquipmentView";
import { RecurringView } from "./views/RecurringView";
import { ProjectProfitView } from "./views/ProjectProfitView";
import {
  deleteTransaction,
  listCategories,
  listTransactions,
  type TransactionFilters,
} from "./api";
import {
  TRANSACTION_STATUSES,
  type FinanceCategory,
  type FinanceTransactionWithCategory,
  type TransactionKind,
  type TransactionStatus,
} from "./types";
import { formatCurrency } from "@/lib/format";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { useConfirm } from "@/components/ui/confirm";
import { exportTransactionsCsv } from "@/lib/csv";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";

type KindFilter = TransactionKind | "all";
type StatusFilter = TransactionStatus | "all";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Converte um "período" selecionado em filtros de data. O padrão é os últimos
 * 12 meses (não mais um único mês), com opções pra ano corrente e global.
 */
function periodToFilter(period: string, customFrom?: string, customTo?: string): { fromDate?: string; toDate?: string } {
  if (period === "custom") return { fromDate: customFrom || undefined, toDate: customTo || undefined };
  const now = new Date();
  if (period === "all") return {};
  if (period === "last12") return { fromDate: isoDaysAgo(365) };
  if (period === "thismonth") {
    const m = now.toISOString().slice(0, 7);
    return { fromDate: `${m}-01`, toDate: `${m}-31` };
  }
  if (period === "thisyear") {
    const y = now.toISOString().slice(0, 4);
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
  }
  // mês específico YYYY-MM
  if (/^\d{4}-\d{2}$/.test(period)) {
    return { fromDate: `${period}-01`, toDate: `${period}-31` };
  }
  return {};
}

function periodOptions(): { value: string; label: string }[] {
  const opts = [
    { value: "last12", label: "Últimos 12 meses" },
    { value: "thismonth", label: "Este mês" },
    { value: "thisyear", label: "Este ano" },
    { value: "all", label: "Total" },
    { value: "custom", label: "Personalizado…" },
  ];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const month = d.toISOString().slice(0, 7);
    const raw = d.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    opts.push({ value: month, label });
    d.setMonth(d.getMonth() - 1);
  }
  return opts;
}

export function FinancePage() {
  const [transactions, setTransactions] = useState<
    FinanceTransactionWithCategory[]
  >([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [filters, setFilters] = useState<{
    kind: KindFilter;
    status: StatusFilter;
    categoryId: number | "all";
    period: string;
    search: string;
    customFrom: string;
    customTo: string;
  }>({
    kind: "all",
    status: "all",
    categoryId: "all",
    period: "all",
    search: "",
    customFrom: "",
    customTo: "",
  });

  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] =
    useState<FinanceTransactionWithCategory | null>(null);
  const [defaultKind, setDefaultKind] = useState<TransactionKind>("income");
  const [categoryMgrOpen, setCategoryMgrOpen] = useState(false);
  const confirm = useConfirm();

  const queryFilters: TransactionFilters = useMemo(
    () => ({
      kind: filters.kind,
      status: filters.status,
      categoryId:
        filters.categoryId === "all" ? undefined : filters.categoryId,
      ...periodToFilter(filters.period, filters.customFrom, filters.customTo),
      search: filters.search,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [tx, cats] = await Promise.all([
        listTransactions(queryFilters),
        listCategories(),
      ]);
      setTransactions(tx);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate(kind: TransactionKind) {
    setEditing(null);
    setDefaultKind(kind);
    setFormOpen(true);
  }

  useNewItemShortcut(() => openCreate("income"));

  function openEdit(t: FinanceTransactionWithCategory) {
    setEditing(t);
    setFormOpen(true);
  }

  async function handleDelete(t: FinanceTransactionWithCategory) {
    const ok = await confirm({
      title: "Excluir transação",
      description: t.gig_id
        ? "Esta receita está vinculada a uma GIG. Excluí-la some só com o lançamento financeiro, a GIG continua."
        : "Tem certeza que quer excluir esta transação?",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteTransaction(t.id);
    await refresh();
    toast.success("Transação excluída");
  }

  async function handleExportCsv() {
    try {
      const path = await exportTransactionsCsv(transactions);
      if (path) toast.success("CSV exportado com sucesso");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar CSV");
    }
  }

  const monthIncome = transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const monthBalance = monthIncome - monthExpense;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transações</TabsTrigger>
          <TabsTrigger value="profit">Lucro por projeto</TabsTrigger>
          <TabsTrigger value="recurring">Recorrentes</TabsTrigger>
          <TabsTrigger value="equipment">Patrimônio</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <ModuleToolbar
            primaryAction={{ label: "Receita", icon: Plus, onClick: () => openCreate("income") }}
            secondaryActions={[
              { label: "Despesa", icon: Plus, onClick: () => openCreate("expense") },
              { label: "Exportar CSV", icon: Download, onClick: handleExportCsv },
              { label: "Categorias", icon: Settings, onClick: () => setCategoryMgrOpen(true) },
            ]}
            search={{
              value: filters.search,
              onChange: (v) => setFilters((f) => ({ ...f, search: v })),
              placeholder: "Buscar descrição, categoria…",
            }}
            resultCount={transactions.length}
            resultLabel="lançamentos"
            filtersActiveCount={
              (filters.kind !== "all" ? 1 : 0) +
              (filters.period !== "all" ? 1 : 0) +
              (filters.categoryId !== "all" ? 1 : 0) +
              (filters.status !== "all" ? 1 : 0)
            }
            filters={
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <Select
                    value={filters.kind}
                    onValueChange={(v) => setFilters((f) => ({ ...f, kind: v as KindFilter }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Entradas e saídas</SelectItem>
                      <SelectItem value="income">Só entradas</SelectItem>
                      <SelectItem value="expense">Só saídas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Período</label>
                  <Select
                    value={filters.period}
                    onValueChange={(v) => setFilters((f) => ({ ...f, period: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {periodOptions().map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {filters.period === "custom" && (
                  <div className="flex items-end gap-2">
                    <Input
                      type="date"
                      className="w-full"
                      value={filters.customFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, customFrom: e.target.value }))}
                    />
                    <span className="pb-2 text-sm text-muted-foreground">até</span>
                    <Input
                      type="date"
                      className="w-full"
                      value={filters.customTo}
                      onChange={(e) => setFilters((f) => ({ ...f, customTo: e.target.value }))}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                  <Select
                    value={filters.categoryId.toString()}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, categoryId: v === "all" ? "all" : Number(v) }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas categorias</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.kind === "income" ? "↑ " : "↓ "}
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select
                    value={filters.status}
                    onValueChange={(v) => setFilters((f) => ({ ...f, status: v as StatusFilter }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {TRANSACTION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            }
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <KPIChip label="Receitas (filtro)" value={formatCurrency(monthIncome)} tone="income" />
            <KPIChip label="Despesas (filtro)" value={formatCurrency(monthExpense)} tone="expense" />
            <KPIChip
              label="Saldo (filtro)"
              value={formatCurrency(monthBalance)}
              tone={monthBalance >= 0 ? "income" : "expense"}
              bold
            />
          </div>

          {loading ? (
            <SkeletonList />
          ) : (
            <TransactionList
              transactions={transactions}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="profit">
          <ProjectProfitView />
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringView onChanged={refresh} />
        </TabsContent>

        <TabsContent value="equipment">
          <EquipmentView />
        </TabsContent>
      </Tabs>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        defaultKind={defaultKind}
        onSaved={refresh}
      />

      <CategoryManager
        open={categoryMgrOpen}
        onOpenChange={setCategoryMgrOpen}
        onChanged={refresh}
      />
    </div>
  );
}

function KPIChip({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
  bold?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 tabular-nums font-semibold ${bold ? "text-2xl" : "text-xl"} ${
          tone === "income" ? "text-emerald-500" : "text-destructive"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
