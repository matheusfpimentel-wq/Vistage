import { useState } from "react";
import { Lock } from "lucide-react";
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
  getDisabledRuleIds,
  isPauseMode,
  setPauseMode,
  toggleRuleDisabled,
} from "@/modules/revisao/ruleConfig";
import { CustomRulesSection, Toggle } from "./CustomRulesSection";

const CATEGORY_ORDER: RuleCategory[] = [
  "GIGs",
  "Produção",
  "Pessoas",
  "Tarefas",
  "Festas",
  "Aulas",
  "Objetivos",
];

/** Editor dos ALERTAS: liga/desliga as regras padrão + cria regras próprias. */
export function AdvancedRulesSettings() {
  const [disabled, setDisabled] = useState<Set<string>>(
    () => new Set(getDisabledRuleIds())
  );
  const [paused, setPaused] = useState(isPauseMode());

  function toggle(id: string) {
    const willDisable = !disabled.has(id);
    setDisabled(new Set(toggleRuleDisabled(id, willDisable)));
  }

  const byCategory = new Map<RuleCategory, BuiltinRule[]>();
  for (const r of BUILTIN_RULES) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }
  const activeCount = BUILTIN_RULES.length - disabled.size;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Modo pausa</p>
            <p className="text-xs leading-snug text-muted-foreground">
              Suspende os alertas de pipeline/continuidade (gigs à frente, funil de
              produção, conteúdo/ideias parados, relacionamento) durante uma pausa
              deliberada. <strong>Dinheiro e prazo continuam avisando.</strong>
            </p>
          </div>
          <Toggle
            on={paused}
            onClick={() => {
              const next = !paused;
              setPaused(next);
              setPauseMode(next);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras padrão</CardTitle>
          <CardDescription>
            {activeCount} de {BUILTIN_RULES.length} regras ativas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
            <div key={cat} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cat}
              </h4>
              <div className="space-y-1.5">
                {byCategory.get(cat)!.map((r) => {
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
                          {r.inegociavel && (
                            <Lock
                              className="h-3 w-3 shrink-0 text-emerald-500"
                              aria-label="Inegociável — regra de dinheiro/fisco; só pode desativar, não excluir"
                            />
                          )}
                          <span className={cn(!on && "line-through")}>{r.message}</span>
                        </p>
                        <p className="text-xs leading-snug text-muted-foreground">
                          Dispara quando: {r.trigger}
                        </p>
                      </div>
                      <Toggle on={on} onClick={() => toggle(r.id)} />
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
