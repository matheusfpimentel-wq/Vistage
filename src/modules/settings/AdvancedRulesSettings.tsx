import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/tooltip";
import {
  BUILTIN_RULES,
  SEVERITY_BUCKET_LABEL,
  type AlertSeverity,
  type BuiltinRule,
  type RuleTriggerConfig,
} from "@/modules/revisao/alerts";
import {
  getCoolingDays,
  getCoolingHeat,
  getDisabledRuleIds,
  getFestaSalesPct,
  getLoteSoldPct,
  getOkrsLaggingDays,
  getOkrsLaggingPct,
  getPackageHoursLeft,
  getPrepHours,
  restoreDefaultRules,
  setCoolingDays,
  setCoolingHeat,
  setFestaSalesPct,
  setLoteSoldPct,
  setOkrsLaggingDays,
  setOkrsLaggingPct,
  setPackageHoursLeft,
  setPrepHours,
  toggleRuleDisabled,
} from "@/modules/revisao/ruleConfig";
import { COOLING_RULE_ID } from "@/modules/revisao/cooling";
import { heatLabel, type IdeaHeat } from "@/modules/ideas/types";
import { CustomRulesSection, Toggle } from "./CustomRulesSection";

/** Rótulo do calor mínimo do "esfriando" — 0 é um estado especial (desliga a
 * regra), o resto (1–5) é o mesmo vocabulário Fria..Quente usado em Ideias. */
function coolingHeatLabel(h: number): string {
  return h === 0 ? "Nenhum (desliga a regra)" : heatLabel(h as IdeaHeat);
}

/**
 * Editor dos ALERTAS padrão, organizado POR TIPO (Esfriamento no topo, depois
 * Alertas graves → Exige ação → Avisos): liga/desliga cada regra (com "Restaurar
 * padrão") + cria regras próprias. As regras inegociáveis (cadeado verde —
 * dinheiro/fisco) ficam SEMPRE ligadas: não dá pra desativar nem editar.
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
  const [okrsLaggingPct, setOkrsLaggingPctState] = useState(() => getOkrsLaggingPct());
  const [okrsLaggingDays, setOkrsLaggingDaysState] = useState(() => getOkrsLaggingDays());

  // Alimenta o texto "Dispara quando" de cada regra com os limiares ATUAIS —
  // nunca um "configurado"/"padrão X" genérico que pode já não bater com o
  // valor efetivo (ver RuleTriggerConfig em revisao/alerts.ts).
  const triggerCfg: RuleTriggerConfig = {
    coolingDays,
    coolingHeatLabel: coolingHeatLabel(coolingHeat),
    prepHours,
    packageHoursLeft: packageHours,
    festaSalesPct,
    loteSoldPct,
    okrsLaggingPct,
    okrsLaggingDays,
  };

  async function toggle(id: string, important: boolean) {
    const willDisable = !disabled.has(id);
    // Desligar uma regra de dinheiro/fisco pede uma confirmação a mais — são as
    // que mais custam caro se passarem batido — mas o dono decide.
    if (willDisable && important) {
      const ok = await confirmDialog({
        title: "Desativar alerta importante?",
        description:
          "Essa é uma regra de dinheiro/fisco (cachê não recebido, resultado negativo, etc.). Desativá-la some com o aviso — só faça se tiver certeza.",
        confirmLabel: "Desativar mesmo assim",
        destructive: true,
      });
      if (!ok) return;
    }
    setDisabled(new Set(toggleRuleDisabled(id, willDisable)));
  }

  function restore() {
    restoreDefaultRules();
    setDisabled(new Set());
  }

  // Catálogo POR TIPO de alerta: "Esfriamento" fixo no topo, depois os 3 grupos
  // por severidade — Alertas graves (crítico) → Exige ação (atenção) → Avisos (info).
  const coolingRule = BUILTIN_RULES.find((r) => r.id === COOLING_RULE_ID);
  const ruleGroups: { label: string; rules: BuiltinRule[] }[] = [];
  if (coolingRule) ruleGroups.push({ label: "Esfriamento", rules: [coolingRule] });
  for (const sev of ["critico", "atencao", "info"] as AlertSeverity[]) {
    const rules = BUILTIN_RULES.filter(
      (r) => r.id !== COOLING_RULE_ID && r.severidade === sev
    );
    if (rules.length > 0) ruleGroups.push({ label: SEVERITY_BUCKET_LABEL[sev], rules });
  }
  // Toda regra pode ser desligada — inclusive as importantes (dinheiro/fisco).
  const activeCount = BUILTIN_RULES.filter((r) => !disabled.has(r.id)).length;
  const anyDisabled = disabled.size > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">Regras padrão</CardTitle>
                <InfoHint>
                  Todas podem ser desativadas; as marcadas com ⚠ (dinheiro/fisco) pedem uma confirmação a mais.
                </InfoHint>
              </div>
              <CardDescription>
                {activeCount} de {BUILTIN_RULES.length} regras ativas.
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
                  const important = !!r.inegociavel;
                  const on = !disabled.has(r.id);
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
                          {important && (
                            <AlertTriangle
                              className="h-3 w-3 shrink-0 text-amber-500"
                              aria-label="Importante: regra de dinheiro/fisco; desativar pede confirmação"
                            />
                          )}
                          <span className={cn(!on && "line-through")}>{r.message}</span>
                          <InfoHint>Dispara quando: {r.trigger(triggerCfg)}</InfoHint>
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
                            <Select
                              value={String(coolingHeat)}
                              onValueChange={(v) => {
                                const n = Number(v);
                                setCoolingHeatState(n);
                                setCoolingHeat(n);
                              }}
                            >
                              <SelectTrigger className="h-7 w-36 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 1, 2, 3, 4, 5].map((h) => (
                                  <SelectItem key={h} value={String(h)}>
                                    {coolingHeatLabel(h)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                        {r.id === "okrs-lagging" && (
                          <label className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Progresso abaixo de:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={okrsLaggingPct}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(0, Math.min(100, n));
                                setOkrsLaggingPctState(clamped);
                                setOkrsLaggingPct(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>% e menos de</span>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={okrsLaggingDays}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                const clamped = Math.max(1, Math.min(365, n));
                                setOkrsLaggingDaysState(clamped);
                                setOkrsLaggingDays(clamped);
                              }}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-foreground"
                            />
                            <span>dias restantes no quarter</span>
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
                      <Toggle on={on} onClick={() => void toggle(r.id, important)} />
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
