import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CrmPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>CRM</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Em construção na Fase 3. Gestão de contatos (clientes, casas, bookers,
        colaboradores, fornecedores) com histórico de interações vinculado a GIGs.
      </CardContent>
    </Card>
  );
}
