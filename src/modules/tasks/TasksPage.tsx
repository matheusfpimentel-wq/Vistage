import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TasksPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarefas</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Em construção na Fase 4. CRUD de tarefas com categorias, vínculos com GIGs/CRM,
        prioridade, subtarefas e sugestão automática de tarefas ao criar uma GIG.
      </CardContent>
    </Card>
  );
}
