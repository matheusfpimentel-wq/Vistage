import { useCallback, useEffect, useState } from "react";
import { Cake, Check, Coffee, Flame, Gift, HeartHandshake, PartyPopper, Sparkles, User, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCards } from "@/components/shared/Skeleton";
import { toast } from "@/components/ui/toaster";
import { todayISO } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";
import { LevelBadge } from "./LevelBadge";
import {
  addFanPerk,
  createFanTask,
  loadFanClubConfig,
  loadFanToday,
  type FanTodayBuckets,
  type FanTodayItem,
} from "../api";
import type { FanClubAction, FanClubConfig, FanClubPerkTemplate } from "../types";

type BucketKey = keyof FanTodayBuckets;

type BucketDef = {
  key: BucketKey;
  title: string;
  hint: string;
  icon: LucideIcon;
  /** Ação rápida sugerida (id da config); cai num padrão se o usuário a removeu. */
  actionId: string;
  fallback: { label: string; template: string };
};

// "Hoje" = fila de ação. Cada grupo junta os fãs que precisam do mesmo tipo de
// toque agora; o botão usa a ação rápida configurada (vira tarefa com {nome}).
const BUCKETS: BucketDef[] = [
  {
    key: "agradecer",
    title: "Agradecer presença",
    hint: "Estiveram num show recente e ainda não tiveram retorno.",
    icon: HeartHandshake,
    actionId: "agradecer",
    fallback: { label: "Agradecer", template: "Agradecer presença de {nome} no show" },
  },
  {
    key: "parabenizar",
    title: "Parabenizar",
    hint: "Subiram de nível nos últimos dias — vale um toque.",
    icon: PartyPopper,
    actionId: "parabenizar",
    fallback: { label: "Parabenizar", template: "Parabenizar {nome} pela evolução" },
  },
  {
    key: "reativar",
    title: "Reativar",
    hint: "Fãs fortes esfriando — sem contato faz tempo.",
    icon: Flame,
    actionId: "reativar",
    fallback: { label: "Reativar", template: "Reativar contato com {nome}" },
  },
  {
    key: "aniversarios",
    title: "Aniversários",
    hint: "Nos próximos 7 dias.",
    icon: Cake,
    actionId: "aniversario",
    fallback: { label: "Parabenizar", template: "Mensagem de aniversário para {nome}" },
  },
  {
    key: "boasVindas",
    title: "Boas-vindas",
    hint: "Fãs novos, sem nenhuma interação ainda.",
    icon: Sparkles,
    actionId: "convidar",
    fallback: { label: "Dar boas-vindas", template: "Dar boas-vindas a {nome}" },
  },
];

export function FanTodayView({ onOpenFan }: { onOpenFan: (fanId: number) => void }) {
  const [buckets, setBuckets] = useState<FanTodayBuckets | null>(null);
  const [config, setConfig] = useState<FanClubConfig | null>(null);

  const refresh = useCallback(async () => {
    const [b, c] = await Promise.all([loadFanToday(), loadFanClubConfig()]);
    setBuckets(b);
    setConfig(c);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!buckets) return <SkeletonCards />;

  const total =
    buckets.agradecer.length +
    buckets.parabenizar.length +
    buckets.reativar.length +
    buckets.aniversarios.length +
    buckets.boasVindas.length;

  if (total === 0) {
    return (
      <EmptyState
        icon={Coffee}
        title="Nada pendente hoje."
        description="Quando alguém for a um show, esfriar, fizer aniversário ou entrar novo, aparece aqui pra você agir."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Quem merece um toque agora. Cada ação vira uma tarefa já vinculada ao fã.
      </p>
      {BUCKETS.map((def) => {
        const items = buckets[def.key];
        if (!items.length) return null;
        const action: FanClubAction =
          config?.actions.find((a) => a.id === def.actionId) ?? {
            id: def.actionId,
            label: def.fallback.label,
            titleTemplate: def.fallback.template,
          };
        return (
          <TodayBucket
            key={def.key}
            def={def}
            items={items}
            action={action}
            perks={config?.perks ?? []}
            onOpenFan={onOpenFan}
          />
        );
      })}
    </div>
  );
}

function TodayBucket({
  def,
  items,
  action,
  perks,
  onOpenFan,
}: {
  def: BucketDef;
  items: FanTodayItem[];
  action: FanClubAction;
  perks: FanClubPerkTemplate[];
  onOpenFan: (fanId: number) => void;
}) {
  const Icon = def.icon;
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{def.title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">{def.hint}</span>
      </div>
      <div className="divide-y">
        {items.map((it) => (
          <TodayRow key={it.fan_id} item={it} action={action} perks={perks} onOpenFan={onOpenFan} />
        ))}
      </div>
    </div>
  );
}

function TodayRow({
  item,
  action,
  perks,
  onOpenFan,
}: {
  item: FanTodayItem;
  action: FanClubAction;
  perks: FanClubPerkTemplate[];
  onOpenFan: (fanId: number) => void;
}) {
  const photo = useImageUrl(item.photo_path);
  const [acted, setActed] = useState(false);
  const [perkOpen, setPerkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const initials = item.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function doAction() {
    setBusy(true);
    try {
      await createFanTask(item.fan_id, action.titleTemplate.replace(/\{nome\}/g, item.name));
      setActed(true);
      toast.success(`Tarefa criada para ${item.name}`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function applyPerk(p: FanClubPerkTemplate) {
    setBusy(true);
    try {
      await addFanPerk({
        fan_id: item.fan_id,
        category: p.category,
        name: p.name,
        status: "Planejado",
        date: todayISO(),
        notes: null,
      });
      setPerkOpen(false);
      toast.success(`Perk planejado: ${p.name} → ${item.name}`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
          {photo ? (
            <img src={photo} alt={item.name} className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
              {initials || <User className="h-4 w-4" />}
            </div>
          )}
        </div>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenFan(item.fan_id)}>
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium hover:underline">{item.name}</span>
            <LevelBadge level={item.level} />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {item.detail}
            {item.city ? ` · ${item.city}` : ""}
          </div>
        </button>
        {perks.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={busy}
            aria-label="Dar um perk"
            title="Dar um perk"
            onClick={() => setPerkOpen((v) => !v)}
          >
            <Gift className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant={acted ? "secondary" : "outline"}
          className="h-8 shrink-0"
          disabled={busy || acted}
          onClick={() => void doAction()}
        >
          {acted ? (
            <>
              <Check className="h-3.5 w-3.5" /> Feito
            </>
          ) : (
            action.label
          )}
        </Button>
      </div>
      {perkOpen && perks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
          {perks.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              className="rounded-full border bg-background px-2.5 py-1 text-xs transition hover:border-primary disabled:opacity-50"
              onClick={() => void applyPerk(p)}
            >
              🎁 {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
