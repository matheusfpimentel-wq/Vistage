import { useEffect, useState } from "react";
import { AlertTriangle, Calendar, DollarSign, Star, Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/ui/tooltip";
import { loadInsights, type GigInsights } from "../api";
import { formatCurrency, formatRating } from "@/lib/format";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GIG_STATUSES } from "../types";

type Props = { refreshKey: number };

export function InsightsView({ refreshKey }: Props) {
  const [insights, setInsights] = useState<GigInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [specialOnly, setSpecialOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadInsights({ specialOnly })
      .then(setInsights)
      .finally(() => setLoading(false));
  }, [refreshKey, specialOnly]);

  const specialToggle = (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-amber-500"
        checked={specialOnly}
        onChange={(e) => setSpecialOnly(e.target.checked)}
      />
      <span>⭐ Só especiais</span>
    </label>
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando insights…</div>;
  }
  if (!insights || insights.totalCount === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{specialToggle}</div>
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          {specialOnly
            ? "Nenhuma GIG marcada como especial ainda."
            : "Sem dados ainda — crie algumas GIGs e volte aqui pra ver os insights."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{specialToggle}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Calendar className="h-4 w-4" />}
          label="Total de GIGs"
          value={insights.totalCount.toString()}
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label="Cachê total"
          value={formatCurrency(insights.totalCache)}
        />
        <Stat
          icon={<Star className="h-4 w-4 text-amber-500" />}
          label="Avaliação média"
          value={
            insights.averageRating !== null
              ? formatRating(insights.averageRating)
              : "—"
          }
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          label="Debriefs pendentes"
          value={insights.pendingDebriefs.toString()}
          tone={insights.pendingDebriefs > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {GIG_STATUSES.map((status) => {
              const count = insights.byStatus[status];
              const pct =
                insights.totalCount > 0
                  ? (count / insights.totalCount) * 100
                  : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{status}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Top venues (por avaliação)
            </CardTitle>
            <CardDescription>
              Onde você performou melhor (mínimo 1 debrief preenchido)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.topVenues.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Ainda sem dados de avaliação.
              </div>
            ) : (
              <div className="space-y-2">
                {insights.topVenues.map((v, i) => (
                  <div
                    key={v.venue_name}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="tabular-nums">
                        #{i + 1}
                      </Badge>
                      <span className="font-medium">{v.venue_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {v.gigs} GIG{v.gigs > 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="tabular-nums text-amber-500">
                      {v.avg_rating !== null ? formatRating(v.avg_rating) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução por mês</CardTitle>
          <CardDescription>
            Receita e avaliação média ao longo do tempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {insights.byMonth.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem dados.</div>
          ) : (
            <div className="space-y-3">
              {insights.byMonth.map((m) => {
                const monthLabel = (() => {
                  try {
                    return format(
                      parse(m.month, "yyyy-MM", new Date()),
                      "MMM yyyy",
                      { locale: ptBR }
                    );
                  } catch {
                    return m.month;
                  }
                })();
                const max = Math.max(...insights.byMonth.map((x) => x.revenue), 1);
                return (
                  <div key={m.month} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{monthLabel}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="tabular-nums">
                          {m.count} GIG{m.count > 1 ? "s" : ""}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(m.revenue)}
                        </span>
                        {m.avgRating !== null && (
                          <span className="tabular-nums text-amber-500">
                            ★ {formatRating(m.avgRating)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(m.revenue / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Avaliação por faixa de preparação
            <InfoHint>
              Leitura, não causa: mais preparo costuma andar junto de nota mais
              alta, mas correlação não é causalidade. Faixa aparece só com ≥3
              GIGs avaliadas.
            </InfoHint>
          </CardTitle>
          <CardDescription>
            Compara a nota média das GIGs por quanto da Preparação estava pronto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const shown = insights.ratingByPrepBand.filter((b) => b.sample >= 3);
            if (shown.length === 0) {
              return (
                <div className="text-sm text-muted-foreground">
                  Ainda sem amostra suficiente (mínimo 3 GIGs avaliadas por faixa).
                </div>
              );
            }
            const label: Record<"low" | "mid" | "full", string> = {
              low: "< 50%",
              mid: "50–99%",
              full: "100%",
            };
            return (
              <div className="space-y-2">
                {shown.map((b) => (
                  <div
                    key={b.band}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="font-medium">Preparação {label[b.band]}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {b.sample} GIG{b.sample > 1 ? "s" : ""}
                      </span>
                      <span className="tabular-nums text-amber-500">
                        {b.avgRating !== null ? `★ ${formatRating(b.avgRating)}` : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card className={tone === "warning" ? "border-amber-500/40" : ""}>
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
