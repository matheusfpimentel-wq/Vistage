import { useCallback, useEffect, useState } from "react";
import {
  Cake,
  CalendarClock,
  Check,
  Coffee,
  Flame,
  Gift,
  HeartHandshake,
  ListPlus,
  PartyPopper,
  Sparkles,
  Ticket,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCards } from "@/components/shared/Skeleton";
import { toast } from "@/components/ui/toaster";
import { formatDate, todayISO } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";
import { updateTask } from "@/modules/tasks/api";
import { LevelBadge } from "./LevelBadge";
import {
  addFanPerk,
  createGroupedFanTask,
  listScheduledFanActions,
  loadFanClubConfig,
  loadFanToday,
  nextNonSocialGig,
  type FanTodayBuckets,
  type FanTodayItem,
  type ScheduledFanAction,
} from "../api";
import { FAN_SUGGESTION_RULES, type FanSuggestionKey } from "../suggestions";
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

// "Próximas ações" = fila de ação. Cada grupo junta os fãs que precisam do mesmo
// tipo de toque agora; um ÚNICO botão no cabeçalho vira UMA tarefa agrupada com
// todos os fãs do balde (ex.: "Convidar fulano, cicrano e beltrano…").
//
// Comportamento por balde (ícone, ação rápida, fallback). O TÍTULO e a condição
// ("hint") vêm de FAN_SUGGESTION_RULES — fonte única compartilhada com o diálogo
// "Ações programadas", que mostra a mesma regra de forma explícita.
const BUCKET_BEHAVIOR: Record<
  FanSuggestionKey,
  { icon: LucideIcon; actionId: string; fallback: { label: string; template: string } }
> = {
  agradecer: { icon: HeartHandshake, actionId: "agradecer", fallback: { label: "Agradecer", template: "Agradecer presença de {nome} no show" } },
  convidar: { icon: Ticket, actionId: "convidar", fallback: { label: "Convidar", template: "Convidar {nome} para o próximo show" } },
  parabenizar: { icon: PartyPopper, actionId: "parabenizar", fallback: { label: "Parabenizar", template: "Parabenizar {nome} pela evolução" } },
  reativar: { icon: Flame, actionId: "reativar", fallback: { label: "Reativar", template: "Reativar contato com {nome}" } },
  aniversarios: { icon: Cake, actionId: "aniversario", fallback: { label: "Parabenizar", template: "Mensagem de aniversário para {nome}" } },
  boasVindas: { icon: Sparkles, actionId: "convidar", fallback: { label: "Dar boas-vindas", template: "Dar boas-vindas a {nome}" } },
};

const BUCKETS: BucketDef[] = FAN_SUGGESTION_RULES.map((r) => ({
  key: r.key,
  title: r.title,
  hint: r.when,
  ...BUCKET_BEHAVIOR[r.key],
}));

/** Junta nomes de forma natural: ["A","B","C"] → "A, B e C" (cap p/ não estourar). */
function joinNames(names: string[], cap = 8): string {
  const list = names.length > cap ? [...names.slice(0, cap), `mais ${names.length - cap}`] : names;
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

/** Próxima GIG não-social, resolvida pra rotular/datar o convite. */
type NextGig = { id: number; name: string; date: string } | null;

export function FanTodayView({ onOpenFan }: { onOpenFan: (fanId: number) => void }) {
  const [buckets, setBuckets] = useState<FanTodayBuckets | null>(null);
  const [config, setConfig] = useState<FanClubConfig | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledFanAction[]>([]);
  const [nextGig, setNextGig] = useState<NextGig>(null);

  const refresh = useCallback(async () => {
    const [b, c, s, n] = await Promise.all([
      loadFanToday(),
      loadFanClubConfig(),
      listScheduledFanActions(),
      nextNonSocialGig(),
    ]);
    setBuckets(b);
    setConfig(c);
    setScheduled(s);
    setNextGig(n);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!buckets) return <SkeletonCards />;

  const total =
    buckets.agradecer.length +
    buckets.convidar.length +
    buckets.parabenizar.length +
    buckets.reativar.length +
    buckets.aniversarios.length +
    buckets.boasVindas.length;

  if (total === 0 && scheduled.length === 0) {
    return (
      <EmptyState
        icon={Coffee}
        title="Nada pendente hoje."
        description="Quando alguém for a um show, esfriar, fizer aniversário ou entrar novo, aparece aqui pra você agir. Ações que você agendar para um fã também aparecem aqui."
      />
    );
  }

  return (
    <div className="space-y-4">
      {scheduled.length > 0 && (
        <ScheduledActions items={scheduled} onRefresh={refresh} onOpenFan={onOpenFan} />
      )}

      {BUCKETS.map((def) => {
        const items = buckets[def.key];
        if (!items.length) return null;
        // O balde "Convidar pro próximo show" só faz sentido com uma GIG à frente.
        if (def.key === "convidar" && !nextGig) return null;
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
            nextGig={def.key === "convidar" ? nextGig : null}
            onOpenFan={onOpenFan}
          />
        );
      })}
    </div>
  );
}

/**
 * Seção "ações anotadas": as TAREFAS pendentes vinculadas a fãs com vencimento,
 * ordenadas por data (atrasadas em destaque). É a referência cruzada às Tarefas
 * — "vejo as que anotei".
 */
function ScheduledActions({
  items,
  onRefresh,
  onOpenFan,
}: {
  items: ScheduledFanAction[];
  onRefresh: () => Promise<void>;
  onOpenFan: (fanId: number) => void;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <CalendarClock className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Ações agendadas</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {items.length}
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          O que você anotou pra fazer, por data.
        </span>
      </div>
      <div className="divide-y">
        {items.map((it) => (
          <ScheduledRow key={it.task_id} item={it} onRefresh={onRefresh} onOpenFan={onOpenFan} />
        ))}
      </div>
    </div>
  );
}

function ScheduledRow({
  item,
  onRefresh,
  onOpenFan,
}: {
  item: ScheduledFanAction;
  onRefresh: () => Promise<void>;
  onOpenFan: (fanId: number) => void;
}) {
  const photo = useImageUrl(item.fan_photo_path);
  const [busy, setBusy] = useState(false);
  const overdue = item.due_date < todayISO();

  const initials = item.fan_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function complete() {
    setBusy(true);
    try {
      await updateTask({ id: item.task_id, status: "Concluída" });
      toast.success("Ação concluída");
      await onRefresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
        {photo ? (
          <img src={photo} alt={item.fan_name} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
            {initials || <User className="h-4 w-4" />}
          </div>
        )}
      </div>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenFan(item.fan_id)}>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium hover:underline">{item.fan_name}</span>
          <LevelBadge level={item.fan_level} />
        </div>
        <div className="truncate text-xs text-muted-foreground">{item.title}</div>
      </button>
      <span
        className={
          overdue
            ? "shrink-0 text-xs font-medium text-destructive"
            : "shrink-0 text-xs text-muted-foreground"
        }
        title={overdue ? "Atrasada" : undefined}
      >
        {formatDate(item.due_date)}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        disabled={busy}
        aria-label="Concluir ação"
        title="Concluir ação"
        onClick={() => void complete()}
      >
        <Check className="h-4 w-4" />
      </Button>
    </div>
  );
}

function TodayBucket({
  def,
  items,
  action,
  perks,
  nextGig,
  onOpenFan,
}: {
  def: BucketDef;
  items: FanTodayItem[];
  action: FanClubAction;
  perks: FanClubPerkTemplate[];
  nextGig: NextGig;
  onOpenFan: (fanId: number) => void;
}) {
  const Icon = def.icon;
  // Dispensados localmente (X): saem da lista e NÃO entram na tarefa agrupada.
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const [acted, setActed] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = items.filter((it) => !dismissed.has(it.fan_id));

  function dismiss(fanId: number) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(fanId);
      return next;
    });
  }

  // UMA tarefa única com TODOS os fãs visíveis do balde (não uma por fã).
  async function createGrouped() {
    if (visible.length === 0 || busy) return;
    setBusy(true);
    try {
      const joined = joinNames(visible.map((v) => v.name));
      const title = nextGig
        ? `Convidar ${joined} para ${nextGig.name}`
        : action.titleTemplate.replace(/\{nome\}/g, joined);
      await createGroupedFanTask(
        visible.map((v) => v.fan_id),
        title,
        nextGig ? { due_date: nextGig.date } : undefined
      );
      setActed(true);
      toast.success(
        visible.length === 1
          ? `Tarefa criada para ${visible[0].name}`
          : `Tarefa criada para ${visible.length} fãs`
      );
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Todos dispensados e nada criado → o balde some.
  if (visible.length === 0 && !acted) return null;

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{def.title}</span>
        {!acted && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {visible.length}
          </span>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span className="hidden truncate text-xs text-muted-foreground sm:block">{def.hint}</span>
          {!acted && (
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={busy || visible.length === 0}
              onClick={() => void createGrouped()}
              title="Cria uma tarefa única com todos abaixo"
            >
              <ListPlus className="h-3.5 w-3.5" /> {action.label}
            </Button>
          )}
        </div>
      </div>
      {acted ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-primary" /> Tarefa criada.
        </div>
      ) : (
        <div className="divide-y">
          {visible.map((it) => (
            <TodayRow
              key={it.fan_id}
              item={it}
              perks={perks}
              bucketBusy={busy}
              onOpenFan={onOpenFan}
              onDismiss={() => dismiss(it.fan_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TodayRow({
  item,
  perks,
  bucketBusy,
  onOpenFan,
  onDismiss,
}: {
  item: FanTodayItem;
  perks: FanClubPerkTemplate[];
  /** Balde criando a tarefa agrupada — desabilita as ações da linha. */
  bucketBusy: boolean;
  onOpenFan: (fanId: number) => void;
  onDismiss: () => void;
}) {
  const photo = useImageUrl(item.photo_path);
  const [perkOpen, setPerkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const disabled = busy || bucketBusy;

  const initials = item.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
      <div className="flex items-center gap-2">
        {/* X à esquerda: dispensa a sugestão (não inclui na tarefa agrupada). */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          disabled={disabled}
          aria-label="Dispensar sugestão"
          title="Dispensar (não incluir na tarefa)"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
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
            disabled={disabled}
            aria-label="Dar um perk"
            title="Dar um perk"
            onClick={() => setPerkOpen((v) => !v)}
          >
            <Gift className="h-4 w-4" />
          </Button>
        )}
      </div>
      {perkOpen && perks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-20">
          {perks.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
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
