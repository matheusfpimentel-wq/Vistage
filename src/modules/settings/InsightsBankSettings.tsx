import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProvocationsManager } from "@/modules/ideas/ProvocationsManager";
import { CustomRulesSection } from "./CustomRulesSection";

/**
 * Aba "Insights" do Config. avançada. Gerencia as PROVOCAÇÕES do dado de
 * insights (os textinhos que aparecem em Ideias) — ocultar/mostrar e excluir as
 * derivadas dos seus dados — além das regras de insight por operadores lógicos.
 */
export function InsightsBankSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provocações de insight</CardTitle>
          <CardDescription>
            Os textinhos que aparecem em Ideias pra estimular conexões. Oculte os
            que não quer ver; exclua de vez os que vêm dos seus dados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvocationsManager />
        </CardContent>
      </Card>

      {/* Insights por operadores lógicos (regra severidade 'insight') */}
      <CustomRulesSection severity="insight" />
    </div>
  );
}
