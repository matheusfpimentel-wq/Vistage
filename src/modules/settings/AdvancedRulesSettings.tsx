import { useState } from "react";
import { Info } from "lucide-react";
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
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Como funcionam os alertas
          </CardTitle>
          <CardDescription>
            Cada alerta observa seus dados e, quando a condição bate, aparece no
            sininho 🔔 e nos painéis de pendências.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            • Abaixo você vê <strong className="text-foreground">a mensagem que
            aparece</strong> em cada alerta e <strong className="text-foreground">quando
            ela dispara</strong>.
          </p>
          <p>
            • <strong className="text-foreground">Desligar</strong> faz o alerta
            parar de aparecer — sem apagar nada do seu conteúdo.
          </p>
          <p>
            • Você pode criar os seus em <strong className="text-foreground">Minhas
            regras</strong> (operadores <code>&lt;</code>, <code>&gt;</code>,{" "}
            <code>=</code> e “sem movimento há X dias”). As mudanças viajam com o
            seu <code>.vistage</code>.
          </p>
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
                        <p
                          className={cn(
                            "text-sm font-medium leading-snug",
                            !on && "line-through"
                          )}
                        >
                          {r.message}
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
