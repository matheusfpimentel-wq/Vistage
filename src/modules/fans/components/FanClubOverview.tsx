import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Crown, Flame, Heart, ListChecks, Mic2, Snowflake, Sparkles, TrendingUp, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCards } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { toLocalYearMonth } from "@/lib/format";
import { listFans, loadFanToday, topFansByPresence, type FanTodayBuckets } from "../api";
import { FAN_LEVELS, type Fan, type FanLevel } from "../types";
import type { FanSuggestionKey } from "../suggestions";

/**
 * Porta de entrada do clube: a base de fãs como pirâmide de fidelidade, do
 * Embaixador (topo) ao Possível fã (base). Cada faixa é clicável: expande a
 * prévia dos fãs logo abaixo dela. Ao lado, os sinais que importam pra
 * transformar o clube num draw comprovável.
 */

const LEVEL_META: Record<FanLevel, { icon: LucideIcon; text: string; fill: string }> = {
  "Embaixador": { icon: Crown, text: "text-amber-500", fill: "bg-amber-500/25" },
  "Superfã": { icon: Flame, text: "text-emerald-500", fill: "bg-emerald-500/25" },
  "Fã": { icon: Heart, text: "text-sky-400", fill: "bg-sky-500/25" },
  "Quase fã": { icon: UserPlus, text: "text-muted-foreground", fill: "bg-secondary" },
  "Possível fã": { icon: Sparkles, text: "text-muted-foreground", fill: "bg-muted" },
};

const BUCKET_LABEL: Record<FanSuggestionKey, string> = {
  agradecer: "Agradecer",
  convidar: "Convidar",
  parabenizar: "Parabenizar",
  reativar: "Reativar",
  aniversarios: "Aniversário",
};

// "Esfriando" só é sinal com sentido pra quem já é fã de verdade. Pra Quase
// fã/Possível fã, "sem contato" é a maioria (nunca esquentaram), então
// mostrar isso classificaria quase todo mundo como esfriando sem sentido.
const COOLING_ELIGIBLE = new Set<FanLevel>(["Fã", "Superfã", "Embaixador"]);

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const iso = dateStr.includes("T") ? dateStr : dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : `${dateStr.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function toDate(raw: string): Date {
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  return new Date(iso);
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

type TierStat = {
  level: FanLevel;
  members: Fan[];
  novos: number;
  /** Só preenchido pra Superfã: chegar lá é sempre subir (ver cálculo abaixo). */
  subiram: number | null;
  esfriando: number | null;
};

function buildTierStats(fans: Fan[]): TierStat[] {
  return FAN_LEVELS.map((level) => {
    const members = fans.filter((f) => f.level === level);
    const novos = members.filter((f) => (daysSince(f.created_at) ?? 999) <= 14).length;
    // Só afirma "subiram" pra Superfã: chegar lá só acontece subindo de Fã
    // (Embaixador é manual; Fã/Quase fã podem ter caído de um nível acima, e
    // nivel_changed_at não guarda a direção). Mesmo cuidado do balde
    // "Parabenizar" corrigido no Lote 1.
    const subiram =
      level === "Superfã"
        ? members.filter((f) => (daysSince(f.nivel_changed_at) ?? 999) <= 14).length
        : null;
    const esfriando = COOLING_ELIGIBLE.has(level)
      ? members.filter((f) => {
          const d = daysSince(f.last_interaction_at);
          return d === null || d >= 30;
        }).length
      : null;
    return { level, members, novos, subiram, esfriando };
  });
}

type GrowthPoint = { ym: string; label: string; count: number };

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Novos fãs por mês, últimos N meses (computado no cliente, sem query nova). */
function buildGrowth(fans: Fan[], months = 6): GrowthPoint[] {
  const now = new Date();
  const points: GrowthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({ ym: toLocalYearMonth(d), label: MONTH_ABBR[d.getMonth()], count: 0 });
  }
  const byYm = new Map(points.map((p) => [p.ym, p]));
  for (const f of fans) {
    const d = toDate(f.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const p = byYm.get(toLocalYearMonth(d));
    if (p) p.count += 1;
  }
  return points;
}

export function FanClubOverview({
  onOpenLevel,
  onOpenFan,
  onOpenToday,
}: {
  onOpenLevel: (level: FanLevel) => void;
  onOpenFan: (fanId: number) => void;
  onOpenToday: () => void;
}) {
  const [fans, setFans] = useState<Fan[]>([]);
  const [buckets, setBuckets] = useState<FanTodayBuckets | null>(null);
  const [topPresence, setTopPresence] = useState<{ fan_id: number; name: string; gigs: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<FanLevel | null>(null);

  const load = useCallback(async () => {
    const [fs, b, tp] = await Promise.all([listFans({}), loadFanToday(), topFansByPresence(5)]);
    setFans(fs);
    setBuckets(b);
    setTopPresence(tp);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener(DATA_CHANGED, h);
    return () => window.removeEventListener(DATA_CHANGED, h);
  }, [load]);

  const tiers = useMemo(() => buildTierStats(fans), [fans]);
  const growth = useMemo(() => buildGrowth(fans), [fans]);
  const total = fans.length;
  const novosMes = growth[growth.length - 1]?.count ?? 0;
  const esfriandoTotal = buckets?.reativar.length ?? 0;
  const acoesHoje = buckets
    ? buckets.agradecer.length + buckets.convidar.length + buckets.parabenizar.length + buckets.reativar.length + buckets.aniversarios.length
    : 0;

  if (loading) return <SkeletonCards />;

  if (total === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Seu clube ainda não tem fãs."
        description="Adicione o primeiro fã ou importe a lista VIP de um show."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span><b className="font-semibold text-foreground">{total}</b> no clube</span>
        {novosMes > 0 && <span><b className="font-semibold text-foreground">+{novosMes}</b> este mês</span>}
        {esfriandoTotal > 0 && <span><b className="font-semibold text-sky-400">{esfriandoTotal}</b> esfriando</span>}
        {acoesHoje > 0 && <span><b className="font-semibold text-foreground">{acoesHoje}</b> ações pra hoje</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="space-y-2">
          {tiers.map((t) => (
            <TierRow
              key={t.level}
              stat={t}
              total={total}
              expanded={expanded === t.level}
              onToggle={() => setExpanded((cur) => (cur === t.level ? null : t.level))}
              onOpenLevel={onOpenLevel}
              onOpenFan={onOpenFan}
            />
          ))}
        </div>

        <div className="space-y-3">
          <div className="glass-panel space-y-2.5 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Snowflake className="h-3.5 w-3.5 text-sky-400" /> Esfriando
            </div>
            {buckets && buckets.reativar.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {buckets.reativar.slice(0, 6).map((f) => (
                  <button
                    key={f.fan_id}
                    onClick={() => onOpenFan(f.fan_id)}
                    className="rounded-full border bg-card px-2.5 py-1 text-xs hover:border-sky-400"
                    title={f.detail}
                  >
                    {f.name}
                  </button>
                ))}
                {buckets.reativar.length > 6 && (
                  <span className="self-center text-xs text-muted-foreground">+{buckets.reativar.length - 6}</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Ninguém esfriando agora.</p>
            )}
          </div>

          <div className="glass-panel space-y-2.5 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Mic2 className="h-3.5 w-3.5" /> Enche a pista
            </div>
            {topPresence.length > 0 ? (
              <ul className="space-y-1.5">
                {topPresence.map((p, i) => (
                  <li key={p.fan_id}>
                    <button
                      onClick={() => onOpenFan(p.fan_id)}
                      className="flex w-full items-center gap-2 text-left text-sm hover:text-primary"
                    >
                      <span className="w-3.5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((p.gigs / topPresence[0].gigs) * 100)}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">{p.gigs}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Marque presença nos GIGs pra ver quem mais enche a pista.</p>
            )}
          </div>

          <button
            onClick={onOpenToday}
            className="glass-panel block w-full space-y-2.5 p-4 text-left transition hover:border-primary"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Ações de hoje
            </div>
            <div className="font-mono text-2xl font-bold leading-none">{acoesHoje}</div>
            {acoesHoje > 0 && buckets && (
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(BUCKET_LABEL) as FanSuggestionKey[])
                  .filter((k) => buckets[k].length > 0)
                  .map((k) => (
                    <span key={k} className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                      {buckets[k].length} {BUCKET_LABEL[k]}
                    </span>
                  ))}
              </div>
            )}
          </button>

          <div className="glass-panel space-y-1 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Crescimento
            </div>
            <div className="font-mono text-2xl font-bold leading-none">
              +{novosMes} <span className="text-xs font-normal text-muted-foreground">este mês</span>
            </div>
            <div className="-mx-1 pt-1">
              <ResponsiveContainer width="100%" height={52}>
                <AreaChart data={growth} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fanGrowthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" hide />
                  <YAxis hide domain={[0, "dataMax + 1"]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                      padding: "4px 8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Novos fãs"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#fanGrowthFill)"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function tierMovementLabel(t: TierStat): string | null {
  const parts: string[] = [];
  if (t.subiram) parts.push(`${t.subiram} subiram`);
  if (t.novos) parts.push(`${t.novos} novo${t.novos === 1 ? "" : "s"}`);
  if (t.esfriando) parts.push(`${t.esfriando} esfriando`);
  return parts.length ? parts.join(" · ") : null;
}

function TierRow({
  stat,
  total,
  expanded,
  onToggle,
  onOpenLevel,
  onOpenFan,
}: {
  stat: TierStat;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onOpenLevel: (level: FanLevel) => void;
  onOpenFan: (fanId: number) => void;
}) {
  const meta = LEVEL_META[stat.level];
  const Icon = meta.icon;
  const share = total > 0 ? Math.round((stat.members.length / total) * 100) : 0;
  const fillWidth = total > 0 ? Math.max(share, 6) : 0;
  const movement = tierMovementLabel(stat);
  const preview = stat.members.slice(0, 4);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={expanded}
        className="glass-panel relative flex w-full items-center gap-3 overflow-hidden p-3 text-left transition"
      >
        <span aria-hidden className={cn("absolute inset-y-0 left-0", meta.fill)} style={{ width: `${fillWidth}%` }} />
        <Icon className={cn("relative h-4 w-4 shrink-0", meta.text)} />
        <div className="relative min-w-0 flex-1">
          <div className="font-semibold leading-tight">{stat.level}</div>
          {movement && <div className="truncate text-xs text-muted-foreground">{movement}</div>}
        </div>
        <div className="relative hidden shrink-0 items-center sm:flex">
          {preview.map((f, i) => (
            <span
              key={f.id}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border-2 bg-muted text-[10px] font-semibold",
                meta.text,
                i > 0 && "-ml-2"
              )}
              style={{ borderColor: "hsl(var(--card))" }}
            >
              {initials(f.name)}
            </span>
          ))}
          {stat.members.length > preview.length && (
            <span className="-ml-2 flex h-7 items-center rounded-full border bg-card px-2 font-mono text-[10px] text-muted-foreground">
              +{stat.members.length - preview.length}
            </span>
          )}
        </div>
        <div className="relative shrink-0 text-right">
          <div className="font-mono text-lg font-bold leading-none">{stat.members.length}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{share}%</div>
        </div>
      </button>

      {expanded && (
        <div className="glass-panel mt-1.5 space-y-2.5 p-3">
          {stat.members.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum fã neste nível ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {stat.members.slice(0, 16).map((f) => (
                <button
                  key={f.id}
                  onClick={() => onOpenFan(f.id)}
                  className="flex items-center gap-1.5 rounded-full border bg-card py-1 pl-1 pr-2.5 text-xs hover:border-primary"
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold", meta.text)}>
                    {initials(f.name)}
                  </span>
                  {f.name}
                </button>
              ))}
              {stat.members.length > 16 && (
                <span className="self-center text-xs text-muted-foreground">+{stat.members.length - 16}</span>
              )}
            </div>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => onOpenLevel(stat.level)}>
            Abrir os {stat.members.length} e filtrar
          </Button>
        </div>
      )}
    </div>
  );
}
