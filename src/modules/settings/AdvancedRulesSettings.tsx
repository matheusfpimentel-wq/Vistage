import { useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BUILTIN_RULES,
  type BuiltinRule,
  type RuleCategory,
} from "@/modules/revisao/alerts";
import {
  getCoolingDays,
  getCoolingHeat,
  getDisabledRuleIds,
  getFestaSalesPct,
  getLoteSoldPct,
  getPackageHoursLeft,
  getPrepHours,
  restoreDefaultRules,
  setCoolingDays,
  setCoolingHeat,
  setFestaSalesPct,
  setLoteSoldPct,
  setPackageHoursLeft,
  setPrepHours,
  toggleRuleDisabled,
} from "@/modules/revisao/ruleConfig";
import { COOLING_RULE_ID } from "@/modules/revisao/cooling";
import { CustomRulesSection, Toggle } from "./CustomRulesSection";

const CATEGORY_ORDER: RuleCategory[] = [
  "Financeiro",
  "GIGs",
  "Produção",
  "Pessoas",
  "Tarefas",
  "Festas",
  "Aulas",
  "Objetivos",
];

/**
 * Editor dos ALERTAS padrão: liga/desliga cada regra (com "Restaurar padrão") +
 * cria regras próprias. As regras inegociáveis (cadeado verde — dinheiro/fisco)
 * ficam SEMPRE ligadas: não dá pra desativar nem editar.
 */
export function AdvancedRulesSettings() {
  const [disabled, setDisabled] = useState<Set<string>>(
    () => new Set(getDisabledRuleIds())
  );
  const [coolingDays, setCoolingDaysState] = useState(() => getCoolingDays());
  const [festaSalesPct, setFestaSalesPctState] = useState(() => getFestaSalesPct());
  const [loteSoldPct, setLoteSoldPctState] = useState(() => getLoteSoldPct());
  const [coolingHeat, setCoolingHeatState] = useState(() => getCoolingHeat());
  const [prepHours, setPrepHoursState] = useState(() => getPrepHours());
  const [packageHours, setPackageHoursState] = useState(() => getPackageHoursLeft());

  function toggle(id: string) {
    const willDisable = !disabled.has(id);
    setDisabled(new Set(toggleRuleDisabled(id, willDisable)));
  }

  function restore() {
    restoreDefaultRules();
    setDisabled(new Set());
  }

  const byCategory = new Map<RuleCategory, BuiltinRule[]>();
  for (const r of BUILTIN_RULES) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }
  // "Esfriando" fica num bloco PRÓPRIO no topo (acima dos grupos por categoria);
  // sai da sua categoria pra não duplicar.
  const coolingRule = BUILTIN_RULES.find((r) => r.id === COOLING_RULE_ID);
  const ruleGroups: { label: string; rules: BuiltinRule[] }[] = [];
  if (coolingRule) ruleGroups.push({ label: "Esfriando", rules: [coolingRule] });
  for (const cat of CATEGORY_ORDER) {
    const rules = (byCategory.get(cat) ?? []).filter((r) => r.id !== COOLING_RULE_ID);
    if (rules.length > 0) ruleGroups.push({ label: cat, rules });
  }
  // Inegociáveis estão sempre ativas; só as demais podem ficar desligadas.
  const activeCount = BUILTIN_RULES.filter(
    (r) => r.inegociavel || !disabled.has(r.id)
  ).length;
  const anyDisabled = disabled.size > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Regras padrão</CardTitle>
              <CardDescription>
                {activeCount} de {BUILTIN_RULES.length} regras ativas. As de{" "}
                <span className="inline-flex items-center gap-0.5 align-middle">
                  <Lock className="inline h-3 w-3 text-emerald-500" />
                  cadeado
                </span>{" "}
                (dinheiro/fisco) ficam sempre ligadas.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={restore}
              disabled={!anyDisabled}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition",
                anyDisabled
                  ? "text-muted-foreground hover:bg-accent"
                  : "cursor-not-allowed opacity-40"
              )}
              title="Reativa todas as regras padrão"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar padrão
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {ruleGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h4>
              <div className="space-y-1.5">
                {group.rules.map((r) => {
                  const locked = !!r.inegociavel;
                  const on = locked || !disabled.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-2.5"
                    >
                      <div className={cn("min-w-0", !on && "opacity-60")}>
                        <p className="flex items-center gap-1.5 text-sm font-medium leading-snug">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              r.severidade === "critico"
                                ? "bg-red-500"
                                : r.severidade === "atencao"
                                ? "bg-amber-500"
                                : "bg-muted-foreground/40"
                            )}
                            title={
                              r.severidade === "critico"
                                ? "Crítico"
                                : r.severidade === "atencao"
                                ? "Atenção"
                                : "Informativo"
                            }
                          />
                          {locked && (
                            <Lock
                              className="h-3 w-3 shrink-0 text-emerald-500"
                              aria-label="Inegociável — regra de dinheiro/fisco; não pode desativar nem editar"
                            />
                          )}
                          <span className={cn(!on && "line-through")}>{r.message}</span>
                        </p>
                        <p className="text-xs leading-snug text-muted-foreground">
                          Dispara quando: {r.trigger}
                        </p>
                        {r.id === "cooling" && (
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Tempo de resfriamento:</span>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={coolingDays}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(1, Math.min(365, n));
                                setCoolingDaysState(clamped);
                                setCoolingDays(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>dias</span>
                          </label>
                        )}
                        {r.id === COOLING_RULE_ID && (
                          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Calor mínimo (ideias):</span>
                            <input
                              type="number"
                              min={0}
                              max={3}
                              value={coolingHeat}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(0, Math.min(3, n));
                                setCoolingHeatState(clamped);
                                setCoolingHeat(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>(0 = desliga a regra)</span>
                          </label>
                        )}
                        {r.id === "gigs-unprepared" && (
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Antecedência:</span>
                            <input
                              type="number"
                              min={1}
                              max={720}
                              value={prepHours}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(1, Math.min(720, n));
                                setPrepHoursState(clamped);
                                setPrepHours(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>horas</span>
                          </label>
                        )}
                        {r.id === "students-low-balance" && (
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Avisar com:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={packageHours}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(0, Math.min(100, n));
                                setPackageHoursState(clamped);
                                setPackageHoursLeft(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>h ou menos no pacote</span>
                          </label>
                        )}
                        {r.id === "festa-vendas-baixas-" && (
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Dispara abaixo de:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={festaSalesPct}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(0, Math.min(100, n));
                                setFestaSalesPctState(clamped);
                                setFestaSalesPct(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>% da meta (0 = nunca)</span>
                          </label>
                        )}
                        {r.id === "lote-esgotando-" && (
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Dispara acima de:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={loteSoldPct}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(0, Math.min(100, n));
                                setLoteSoldPctState(clamped);
                                setLoteSoldPct(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>% vendido</span>
                          </label>
                        )}
                      </div>
                      {locked ? (
                        <span
                          className="shrink-0 select-none self-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                          title="Regra fixa — sempre ligada"
                        >
                          Fixa
                        </span>
                      ) : (
                        <Toggle on={on} onClick={() => toggle(r.id)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CustomRulesSection severity="alerta" />
    </div>
  );
}
