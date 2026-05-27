import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FinancePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financeiro</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Em construção na Fase 5. Entradas e saídas com categorias customizáveis,
        dashboard com gráficos, vínculo de receitas com GIGs, tracking de patrimônio
        e lançamentos recorrentes.
      </CardContent>
    </Card>
  );
}
