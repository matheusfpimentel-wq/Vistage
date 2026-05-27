import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GigsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestor de GIGs</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Em construção na Fase 2. Aqui ficará o CRUD completo de GIGs com pré-evento,
        logística/financeiro e o debrief automático ao concluir uma apresentação.
      </CardContent>
    </Card>
  );
}
