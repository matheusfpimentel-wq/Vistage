import { useEffect, useState } from "react";
import { AlertTriangle, Link2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { InfoHint } from "@/components/ui/tooltip";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createEquipmentExpense,
  equipmentMissingExpense,
  findExpenseCandidates,
  linkEquipmentExpense,
  type ExpenseCandidate,
} from "../api";
import type { Equipment } from "../types";

/**
 * Despesa possivelmente já lançada. Aparece ANTES de criar: o Financeiro é a
 * fonte única de dinheiro, e lançar duas vezes a mesma compra é pior do que
 * não lançar — o total do mês passa a mentir e não há como perceber olhando o
 * Patrimônio.
 */
export function DuplicateExpenseDialog({
  open,
  onOpenChange,
  equipment,
  candidates,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  candidates: ExpenseCandidate[];
  onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  if (!equipment) return null;

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Essa compra já está no Financeiro?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Encontrei {candidates.length === 1 ? "uma despesa" : `${candidates.length} despesas`}{" "}
            perto de {formatDate(equipment.purchase_date!)} que{" "}
            {candidates.length === 1 ? "pode ser" : "podem ser"} a compra de{" "}
            <strong className="text-foreground">{equipment.name}</strong>. Vincule
            em vez de lançar de novo, senão o mês conta o gasto duas vezes.
          </p>
          <div className="divide-y rounded-md border">
            {candidates.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {c.description ?? "(sem descrição)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(c.date)} · {formatCurrency(c.amount)}
                    {c.category_name ? ` · ${c.category_name}` : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="shrink-0 gap-1"
                  onClick={() =>
                    run(
                      () => linkEquipmentExpense(equipment.id, c.id),
                      "Item vinculado à despesa"
                    )
                  }
                >
                  <Link2 className="h-3.5 w-3.5" /> Vincular
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
              toast.success("Item salvo sem lançamento");
            }}
          >
            Não lançar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="gap-1"
            onClick={() =>
              run(async () => {
                await createEquipmentExpense({
                  id: equipment.id,
                  name: equipment.name,
                  purchase_date: equipment.purchase_date!,
                  purchase_value: equipment.purchase_value!,
                });
              }, "Despesa lançada")
            }
          >
            <Wallet className="h-3.5 w-3.5" /> Lançar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Row = {
  eq: Equipment;
  candidates: ExpenseCandidate[];
  checked: boolean;
};

/**
 * Backfill: itens antigos que têm data e valor de compra mas nenhuma despesa
 * no Financeiro. NADA é criado sozinho — tudo começa desmarcado e cada linha
 * mostra se já existe despesa parecida. Lançar 40 despesas retroativas de uma
 * vez sem olhar bagunçaria todos os meses passados de uma vez só.
 */
export function BackfillExpensesDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setRows(null);
      return;
    }
    void (async () => {
      const items = await equipmentMissingExpense();
      const built: Row[] = [];
      for (const eq of items) {
        built.push({
          eq,
          candidates: await findExpenseCandidates({
            name: eq.name,
            value: eq.purchase_value,
            date: eq.purchase_date!,
          }),
          // Começa DESMARCADO, inclusive sem suspeita de duplicata: o padrão é
          // não mexer no histórico financeiro.
          checked: false,
        });
      }
      setRows(built);
    })();
  }, [open]);

  const selected = rows?.filter((r) => r.checked) ?? [];

  async function launch() {
    setBusy(true);
    let ok = 0;
    try {
      for (const r of selected) {
        await createEquipmentExpense({
          id: r.eq.id,
          name: r.eq.name,
          purchase_date: r.eq.purchase_date!,
          purchase_value: r.eq.purchase_value!,
        });
        ok++;
      }
      toast.success(`${ok} despesa(s) lançada(s)`);
      await onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro depois de ${ok} lançamento(s): ${String(e)}`);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lançar despesas que faltam</DialogTitle>
        </DialogHeader>
        {rows == null ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Procurando…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Todo item com data e valor de compra já tem despesa vinculada.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Estes itens têm data e valor de compra, mas nenhuma despesa no
              Financeiro. Marque o que quer lançar — a despesa entra{" "}
              <strong className="text-foreground">na data da compra</strong>, ou
              seja, reescreve o total daquele mês.
            </p>
            <div className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
              {rows.map((r, i) => (
                <label
                  key={r.eq.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={r.checked}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev!.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x))
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.eq.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(r.eq.purchase_date!)} ·{" "}
                      {formatCurrency(r.eq.purchase_value)}
                      {r.eq.category ? ` · ${r.eq.category}` : ""}
                    </div>
                  </div>
                  {r.candidates.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-urgent-soon">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      já pode estar lançada
                      <InfoHint>
                        Existe despesa de {formatCurrency(r.candidates[0].amount)} em{" "}
                        {formatDate(r.candidates[0].date)}
                        {r.candidates[0].description
                          ? ` ("${r.candidates[0].description}")`
                          : ""}
                        . Se for a mesma compra, cancele aqui e vincule pelo item
                        em vez de lançar de novo.
                      </InfoHint>
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={launch} disabled={busy || selected.length === 0}>
            {selected.length === 0
              ? "Nada marcado"
              : `Lançar ${selected.length} despesa(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
