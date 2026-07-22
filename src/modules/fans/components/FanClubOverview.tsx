import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Flame, Heart, Mic2, Snowflake, Sparkles, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCards } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { toLocalYearMonth } from "@/lib/format";
import { listFans, loadFanToday, topFansByPresence, type FanTodayBuckets } from "../api";
import { FAN_LEVELS, type Fan, type FanLevel } from "../types";

/**
 * Porta de entrada do clube: a base de fãs como pirâmide de fidelidade — do
 * Embaixador (topo) ao Possível fã (base). Cada faixa mostra a "plateia" de
 * quem está nela e é clicável: abre uma prévia ali mesmo (embaixo DAQUELA
 * faixa) e, dali, "Abrir e filtrar" leva pro roster completo. Substitui a
 * ausência de qualquer visão geral — antes só dava pra ver o clube fã a fã.
 */

const LEVEL_META: Record<FanLevel, { icon: LucideIcon; text: string; border: string; wash: string }> = {
  "Embaixador": { icon: Crown, text: "text-amber-500", border: "border-amber-500/35", wash: "bg-amber-500/10" },
  "Superfã": { icon: Flame, text: "text-emerald-500", border: "border-emerald-500/35", wash: "bg-emerald-500/10" },
  "Fã": { icon: Heart, text: "text-sky-400", border: "border-sky-500/35", wash: "bg-sky-500/10" },
  "Quase fã": { icon: UserPlus, text: "text-muted-foreground", border: "border-border", wash: "bg-secondary/60" },
  "Possível fã": { icon: Sparkles, text: "text-muted-foreground", border: "border-border", wash: "bg-transparent" },
};

// Larguras decrescentes do topo pra base — a pirâmide de verdade (não só uma
// barra de preenchimento interna). Nenhuma chega a 100%: fica mais estreita e
// centralizada, sem colar nas bordas do card.
const TIER_WIDTH: Record<FanLevel, string> = {
  "Embaixador": "46%",
  "Superfã": "58%",
  "Fã": "70%",
  "Quase fã": "82%",
  "Possível fã": "92%",
};

// "Esfriando" (sem contato 30d+) só é um sinal com sentido pra quem já é
// fã de verdade — mostrar isso pra Quase fã/Possível fã classificaria quase
// todo mundo (que nunca teve contato) como "esfriando" sem nunca ter esquentado.
const COOLING_ELIGIBLE = new Set<FanLevel>(["Fã", "Superfã", "Embaixador"]);

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const iso = dateStr.includes("T") ? dateStr : dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : `${dateStr.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

type TierStat = {
  level: FanLevel;
  members: Fan[];
  novos: number;
  /** Só preenchido pra Superfã: chegar lá é (quase sempre) subir — ver nota no cálculo. */
  subiram: number | null;
  esfriando: number | null;
};

function buildTierStats(fans: Fan[]): TierStat[] {
  return FAN_LEVELS.map((level) => {
    const members = fans.filter((f) => f.level === level);
    const novos = members.filter((f) => (daysSince(f.created_at) ?? 999) <= 14).length;
    // "Subiram" só é uma afirmação HONESTA pra Superfã: chegar lá só acontece
    // subindo de Fã (Embaixador é manual, não entra no recálculo; Fã/Quase fã
    // podem ter chegado subindo OU caindo de um nível acima — nivel_changed_at
    // não guarda a direção, então não afirmar pra esses é o correto, mesmo
    // problema corrigido no balde "Parabenizar" do Lote 1).
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

export function FanClubOverview({
  onOpenLevel,
  onOpenFan,
}: {
  onOpenLevel: (level: FanLevel) => void;
  onOpenFan: (fanId: number) => void;
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
  const total = fans.length;
  const novosMes = useMemo(() => {
    const nowYm = toLocalYearMonth();
    return fans.filter((f) => {
      const iso = f.created_at.includes("T") ? f.created_at : `${f.created_at.replace(" ", "T")}Z`;
      const d = new Date(iso);
      return !Number.isNaN(d.getTime()) && toLocalYearMonth(d) === nowYm;
    }).length;
  }, [fans]);
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
        description="Adicione o primeiro fã (ou importe a lista VIP de um show) e a pirâmide começa a tomar forma."
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass-panel space-y-2.5 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Snowflake className="h-3.5 w-3.5 text-sky-400" /> Esfriando
          </div>
          {buckets && buckets.reativar.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {buckets.reativar.slice(0, 8).map((f) => (
                <button
                  key={f.fan_id}
                  onClick={() => onOpenFan(f.fan_id)}
                  className="rounded-full border bg-card px-2.5 py-1 text-xs hover:border-sky-400"
                  title={f.detail}
                >
                  {f.name}
                </button>
              ))}
              {buckets.reativar.length > 8 && (
                <span className="self-center text-xs text-muted-foreground">+{buckets.reativar.length - 8}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Ninguém esfriando agora — clube aquecido.</p>
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
                    <span className="h-1.5 flex-1 max-w-[72px] overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.round((p.gigs / topPresence[0].gigs) * 100)}%` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {p.gigs} show{p.gigs === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Marque presença nos GIGs pra ver quem mais enche a pista.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function tierMovementLabel(t: TierStat): string | null {
  const parts: string[] = [];
  if (t.subiram) parts.push(`↑ ${t.subiram} subiram`);
  if (t.novos) parts.push(`+${t.novos} novo${t.novos === 1 ? "" : "s"}`);
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
  const width = TIER_WIDTH[stat.level];
  const share = total > 0 ? Math.round((stat.members.length / total) * 100) : 0;
  const movement = tierMovementLabel(stat);
  const preview = stat.members.slice(0, 4);

  return (
    <div className="mx-auto" style={{ maxWidth: width }}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={expanded}
        className={cn(
          "glass-panel flex w-full items-center gap-3 p-3 text-left transition hover:-translate-y-0.5",
          meta.wash,
          expanded && meta.border
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", meta.text)} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{stat.level}</div>
          {movement && <div className="truncate text-xs text-muted-foreground">{movement}</div>}
        </div>
        <div className="hidden shrink-0 items-center sm:flex">
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
        <div className="shrink-0 text-right">
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
            Abrir os {stat.members.length} e filtrar →
          </Button>
        </div>
      )}
    </div>
  );
}
