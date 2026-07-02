import { cn } from "@/lib/utils";
import { EMPTY_VALUE } from "@/lib/format";
import { STAGES, STAGE_COLOR, TRACK_KINDS, TRACK_KIND_LABEL } from "../stages";
import { GATES } from "../gates";
import { trackDisplayName, type StageHistoryEntry, type TrackWithProject } from "../types";

type Props = {
  tracks: TrackWithProject[];
};

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function PortfolioView({ tracks }: Props) {
  // --- Totais gerais ---
  const total = tracks.length;
  const ativas = tracks.filter((t) => !t.standby && t.current_stage !== "Pós-lançamento").length;
  const standby = tracks.filter((t) => t.standby).length;
  const concluidas = tracks.filter((t) => t.current_stage === "Pós-lançamento").length;

  // --- Distribuição por tipo ---
  const kindCounts = TRACK_KINDS.map((k) => ({
    kind: k,
    label: TRACK_KIND_LABEL[k],
    count: tracks.filter((t) => t.kind === k).length,
  })).filter((x) => x.count > 0);

  // --- Tempo médio por stage ---
  const stageAvgDays: { stage: string; avg: number }[] = [];
  for (const stage of STAGES) {
    const durations: number[] = [];
    for (const t of tracks) {
      for (const h of t.stage_history as StageHistoryEntry[]) {
        if (h.stage === stage && h.exited_at) {
          const d = daysBetween(h.entered_at, h.exited_at);
          if (d >= 0) durations.push(d);
        }
      }
    }
    if (durations.length > 0) {
      const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      stageAvgDays.push({ stage, avg });
    }
  }
  const maxAvg = stageAvgDays.reduce((m, x) => Math.max(m, x.avg), 1);

  // --- Taxa de aprovação por gate ---
  const gateStats = GATES.map((gate) => {
    let approved = 0;
    let rejected = 0;
    for (const t of tracks) {
      for (const h of t.stage_history as StageHistoryEntry[]) {
        if (h.gate?.gate_id === gate.id) {
          if (h.gate.decision === "approved") approved++;
          else if (h.gate.decision === "rejected") rejected++;
        }
      }
    }
    const total = approved + rejected;
    const pct = total > 0 ? Math.round((approved / total) * 100) : null;
    return { label: gate.title.split(":")[0].trim(), approved, rejected, total, pct };
  }).filter((g) => g.total > 0);

  // --- Tracks em Stand-by há +180 dias ---
  const now = Date.now();
  const stalledStandby = tracks
    .filter((t) => {
      if (!t.standby) return false;
      const hist = t.stage_history as StageHistoryEntry[];
      if (hist.length === 0) return false;
      const last = hist[hist.length - 1];
      return Math.floor((now - new Date(last.entered_at).getTime()) / 86_400_000) > 180;
    })
    .map((t) => {
      const hist = t.stage_history as StageHistoryEntry[];
      const last = hist[hist.length - 1];
      const days = Math.floor((now - new Date(last.entered_at).getTime()) / 86_400_000);
      return { track: t, days };
    })
    .sort((a, b) => b.days - a.days);

  return (
    <div className="space-y-8">
      {/* Totais gerais */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Totais gerais
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: total },
            { label: "Ativas", value: ativas },
            { label: "Stand-by", value: standby },
            { label: "Concluídas", value: concluidas },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md border bg-muted/20 px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2-col grid for mid sections */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Distribuição por tipo */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Distribuição por tipo
          </h2>
          {kindCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma track cadastrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kindCounts.map(({ kind, label, count }) => (
                <span
                  key={kind}
                  className="rounded-full border bg-muted/30 px-3 py-1 text-sm font-medium"
                >
                  {label}{" "}
                  <span className="ml-0.5 tabular-nums text-muted-foreground">({count})</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Taxa de aprovação por gate */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Taxa de aprovação por gate
          </h2>
          {gateStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma decisão de gate registrada.
            </p>
          ) : (
            <div className="space-y-2">
              {gateStats.map((g) => (
                <div key={g.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="w-16 font-medium">{g.label}</span>
                  <span className="text-muted-foreground">
                    {g.approved} aprovados, {g.rejected} reprovados
                  </span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold",
                      g.pct !== null && g.pct >= 70
                        ? "text-emerald-400"
                        : "text-amber-400"
                    )}
                  >
                    {g.pct !== null ? `${g.pct}%` : EMPTY_VALUE}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Tempo médio por stage */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tempo médio por stage
        </h2>
        {stageAvgDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum dado de histórico de stage disponível ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {stageAvgDays.map(({ stage, avg }) => {
              const stageKey = stage as keyof typeof STAGE_COLOR;
              const widthPct = Math.round((avg / maxAvg) * 100);
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs font-medium">{stage}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn(
                        "absolute left-0 top-0 h-full rounded-full opacity-70",
                        STAGE_COLOR[stageKey]?.split(" ")[0] ?? "bg-primary/40"
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                    {avg} dias
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tracks em Stand-by há +180 dias */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stand-by há +180 dias
        </h2>
        {stalledStandby.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma track parada há mais de 180 dias.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Track</th>
                  <th className="px-3 py-2 text-left">Stage</th>
                  <th className="px-3 py-2 text-right">Dias parada</th>
                </tr>
              </thead>
              <tbody>
                {stalledStandby.map(({ track, days }) => (
                  <tr key={track.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-3 py-2 font-medium">{trackDisplayName(track)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          STAGE_COLOR[track.current_stage]
                        )}
                      >
                        {track.current_stage}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                      {days}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
