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

const CATEGORY_ORDER: RuleCategory[] = [
  "GIGs",
  "Produção",
  "Pessoas",
  "Tarefas",
  "Festas",
  "Aulas",
  "Objetivos",
  "Motivação",
];

/** Toggle acessível (não há componente Switch no projeto). */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Desligar regra" : "Ligar regra"}
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/**
 * Editor das regras de Insights/Alertas. Nesta primeira parte (base) o usuário
 * LIGA/DESLIGA as regras padrão do sistema; criar regras próprias vem a seguir.
 */
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
            Como funcionam os alertas e insights
          </CardTitle>
          <CardDescription>
            Cada regra observa seus dados e, quando a condição bate, mostra um
            alerta no sininho 🔔 e nos painéis de pendências.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            • <strong className="text-foreground">Desligar</strong> uma regra faz
            o alerta dela parar de aparecer — sem apagar nada do seu conteúdo.
          </p>
          <p>
            • Cada regra segue o formato{" "}
            <em>Se {"{"}condição{"}"} → Então {"{"}alerta{"}"}</em>, com
            operadores como <code>&lt;</code>, <code>&gt;</code>, <code>=</code> e
            “sem movimento há X dias”.
          </p>
          <p>
            • As mudanças viajam com o seu arquivo <code>.vistage</code>.
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
                      className="flex items-center justify-between gap-3 rounded-md border p-2.5"
                    >
                      <span
                        className={cn(
                          "text-sm leading-snug",
                          !on && "text-muted-foreground line-through"
                        )}
                      >
                        {r.label}
                      </span>
                      <Toggle on={on} onClick={() => toggle(r.id)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
