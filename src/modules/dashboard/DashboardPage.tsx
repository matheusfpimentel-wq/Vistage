import { useEffect, useState } from "react";
import { AlertTriangle, CalendarRange, DollarSign, Star } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listGigs, loadInsights, type GigInsights } from "@/modules/gigs/api";
import { type Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { formatCurrency, formatDate, formatRating, todayISO } from "@/lib/format";

export function DashboardPage() {
  const [insights, setInsights] = useState<GigInsights | null>(null);
  const [upcoming, setUpcoming] = useState<Gig[]>([]);
  const [pending, setPending] = useState<Gig[]>([]);

  useEffect(() => {
    void (async () => {
      const today = todayISO();
      const [ins, all] = await Promise.all([
        loadInsights(),
        listGigs(),
      ]);
      setInsights(ins);
      setUpcoming(
        all
          .filter(
            (g) =>
              g.date >= today &&
              g.status !== "Concluída" &&
              g.status !== "Cancelada"
          )
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3)
      );
      setPending(all.filter((g) => g.debrief_pending === 1).slice(0, 5));
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>
        <p className="text-sm text-muted-foreground">
          Resumo do seu negócio musical.
        </p>
      </div>

      {/* alerta de debriefs pendentes */}
      {pending.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {pending.length} GIG{pending.length > 1 ? "s" : ""} com debrief pendente
            </CardTitle>
            <CardDescription>
              O coração do sistema é registrar o que aconteceu — finalize quando puder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {pending.map((g) => (
              <Link
                key={g.id}
                to="/gigs"
                className="flex items-center justify-between rounded-md border bg-background p-2 text-sm transition hover:border-amber-500/60"
              >
                <div>
                  <div className="font-medium">{g.venue_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(g.date)}
                  </div>
                </div>
                <Badge variant="warning">finalizar</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarRange className="h-4 w-4" />}
          label="GIGs totais"
          value={insights?.totalCount.toString() ?? "—"}
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Cachê total"
          value={insights ? formatCurrency(insights.totalCache) : "—"}
        />
        <StatCard
          icon={<Star className="h-4 w-4 text-amber-500" />}
          label="Avaliação média"
          value={
            insights?.averageRating !== null && insights?.averageRating !== undefined
              ? formatRating(insights.averageRating)
              : "—"
          }
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          label="Debriefs pendentes"
          value={insights?.pendingDebriefs.toString() ?? "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas GIGs</CardTitle>
          <CardDescription>
            As 3 próximas com data, local e status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sem GIGs futuras agendadas.{" "}
              <Button asChild variant="link" className="px-1">
                <Link to="/gigs">Criar uma</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <div className="font-medium">{g.venue_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(g.date)}
                      {g.venue_city && ` · ${g.venue_city}`}
                    </div>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
