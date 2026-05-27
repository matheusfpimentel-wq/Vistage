import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLACEHOLDER = [
  { title: "Próximas GIGs", body: "As 3 próximas com data, local e status." },
  { title: "Tarefas (7 dias)", body: "O que vence essa semana." },
  { title: "Financeiro do mês", body: "Entradas, saídas e saldo." },
  { title: "Debriefs pendentes", body: "GIGs concluídas sem debrief preenchido." },
];

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>
        <p className="text-sm text-muted-foreground">
          Resumo do seu negócio musical. Os cards serão preenchidos com dados
          reais nas próximas fases.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEHOLDER.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle className="text-base">{c.title}</CardTitle>
              <CardDescription>{c.body}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              em breve
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
