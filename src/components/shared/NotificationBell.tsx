import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toLocalISODate } from "@/lib/format";
import { loadWeekStats } from "@/modules/revisao/api";
import { alertSeverity, computeAlerts, SEVERITY_ORDER, type AlertItem, type ExtraStats } from "@/modules/revisao/alerts";
import { getDisabledRuleIds } from "@/modules/revisao/ruleConfig";
import { getHiddenModules } from "@/lib/moduleVisibility";
import { loadPartyFinanceAlerts } from "@/modules/revisao/partyFinanceAlerts";
import { evaluateCustomRules } from "@/modules/revisao/customRules";
import { filterSnoozed, snoozeAlert } from "@/modules/revisao/snooze";
import { ackCooling, loadCoolingAlerts } from "@/modules/revisao/cooling";
import { AlertIcon } from "@/modules/revisao/alertIcons";
import { checkNotificationPermission, enableNotifications, sendTestNotification, type NotifPermission } from "@/lib/notify";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED, emitDataChanged } from "@/lib/events";
import { getDb } from "@/lib/db";
import { updateGig } from "@/modules/gigs/api";

const SESSION_SEEN_KEY = "notification_bell_seen_keys";

function getSeenKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set<string>();
}

function markKeysSeen(keys: string[]) {
  try {
    const seen = getSeenKeys();
    for (const k of keys) seen.add(k);
    sessionStorage.setItem(SESSION_SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // ignore
  }
}

/** Fisher-Yates in-place shuffle. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Merge + reorder alerts so unseen items appear first (shuffled),
 * then seen items follow (also shuffled). Marks all visible keys as seen.
 */
function mergeAndReorder(lists: AlertItem[][]): AlertItem[] {
  const all = lists.flat();
  const seen = getSeenKeys();
  const unseen = shuffle(all.filter((a) => !seen.has(a.key)));
  const alreadySeen = shuffle(all.filter((a) => seen.has(a.key)));
  const ordered = [...unseen, ...alreadySeen];
  markKeysSeen(ordered.map((a) => a.key));
  return ordered;
}

export async function loadExtraStats(): Promise<ExtraStats> {
  try {
    const db = getDb();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = toLocalISODate(weekStart); // datas LOCAIS (não UTC)
    const today = toLocalISODate();
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyDaysAgo = toLocalISODate(thirtyAgo);

    const [
      gigsNoRatingRows,
      lastTrackRows,
      crmInteractionRows,
      staleSuperFanRows,
      tasksCompletedRows,
      gigsThisMonthRows,
      _focusSessionRows,
    ] = await Promise.all([
      db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM gigs
         WHERE date >= $1 AND date <= $2 AND status = 'Concluída'
           AND (rating_contractor IS NULL)`,
        [weekStartStr, today]
      ),
      db.select<{ created_at: string }[]>(
        `SELECT created_at FROM tracks ORDER BY created_at DESC LIMIT 1`
      ),
      db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM contact_interactions WHERE date >= $1`,
        [weekStartStr]
      ),
      db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM fans
         WHERE level = 'Superfã' AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
        [thirtyDaysAgo]
      ),
      db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM tasks
         WHERE status = 'Concluída' AND updated_at >= $1`,
        [weekStartStr]
      ),
      db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM gigs
         WHERE date LIKE $1 AND status != 'Cancelada'`,
        [`${today.slice(0, 7)}%`]
      ),
      db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM work_sessions
         WHERE started_at >= $1 AND ended_at IS NOT NULL`,
        [`${today.slice(0, 4)}%`]
      ),
    ]);

    const lastTrackDate = lastTrackRows[0]?.created_at?.slice(0, 10);
    const daysSinceLastTrack = lastTrackDate
      ? Math.floor((Date.now() - new Date(lastTrackDate).getTime()) / 86400000)
      : null;

    return {
      gigsWithoutRating: gigsNoRatingRows[0]?.n ?? 0,
      daysSinceLastTrack,
      crmNoInteractionThisWeek: (crmInteractionRows[0]?.n ?? 0) === 0 ? 1 : 0,
      staleSuperFans: staleSuperFanRows[0]?.n ?? 0,
      tasksCompletedThisWeek: tasksCompletedRows[0]?.n ?? 0,
      gigsThisMonth: gigsThisMonthRows[0]?.n ?? 0,
      daysToFocusRecord: null, // complex to compute, skip for now
    };
  } catch {
    return {};
  }
}

/** GIGs cuja data já passou mas continuam como Confirmada/Proposta. */
export async function loadStaleGigStatusAlerts(): Promise<AlertItem[]> {
  try {
    const db = getDb();
    const today = toLocalISODate();
    const rows = await db.select<
      { id: number; date: string; status: string; event_name: string | null; venue_name: string }[]
    >(
      `SELECT id, date, status, event_name, venue_name FROM gigs
        WHERE date < $1 AND status IN ('Confirmada', 'Proposta')
        ORDER BY date DESC LIMIT 5`,
      [today]
    );
    return rows.map((g) => {
      const name = g.event_name?.trim() || g.venue_name;
      return {
        key: `gig-stale-status-${g.id}`,
        label: `GIG em ${name} (${g.date}) já passou e ainda está como ${g.status} — atualize o status.`,
        to: `/gigs?open=${g.id}`,
        critical: true,
        icon: "warning" as const,
      };
    });
  } catch {
    return [];
  }
}

/** Recebíveis previstos cuja data já passou e ainda não foram marcados como recebidos. */
export async function loadOverdueReceivableAlerts(): Promise<AlertItem[]> {
  try {
    const db = getDb();
    const today = toLocalISODate();
    const rows = await db.select<
      { id: number; date: string; amount: number; description: string | null }[]
    >(
      `SELECT id, date, amount, description FROM finance_transactions
        WHERE kind = 'income' AND status = 'Previsto' AND date < $1
        ORDER BY date ASC LIMIT 5`,
      [today]
    );
    return rows.map((t) => {
      const [y, m, d] = t.date.slice(0, 10).split("-");
      const dateBR = `${d}/${m}/${y}`;
      const valor = t.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const what = t.description?.trim() || "Recebível";
      return {
        key: `receivable-overdue-${t.id}`,
        label: `Recebível previsto venceu em ${dateBR}: ${what} (${valor}) — ainda não recebido.`,
        to: `/financeiro`,
        critical: true,
        icon: "dollar" as const,
      };
    });
  } catch {
    return [];
  }
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [crmAlerts, setCrmAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [perm, setPerm] = useState<NotifPermission>("granted");
  useEffect(() => {
    void checkNotificationPermission().then(setPerm);
  }, []);
  const ref = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const [stats, extra, custom] = await Promise.all([
          loadWeekStats(),
          loadExtraStats(),
          evaluateCustomRules(),
        ]);
        setAlerts(
          await filterSnoozed([
            ...computeAlerts(stats, extra, getDisabledRuleIds(), getHiddenModules()),
            ...custom,
          ])
        );
      } catch {
        // silently ignore
      }
      void Promise.all([
        loadCoolingAlerts(),
        loadStaleGigStatusAlerts(),
        loadOverdueReceivableAlerts(),
        loadPartyFinanceAlerts(),
      ]).then(([cooling, stale, receivables, partyFin]) =>
        setCrmAlerts([...partyFin, ...receivables, ...stale, ...cooling])
      );
    }, 500);
  }, []);

  useEffect(() => {
    const load = () =>
      void Promise.all([
        loadCoolingAlerts(),
        loadStaleGigStatusAlerts(),
        loadOverdueReceivableAlerts(),
        loadPartyFinanceAlerts(),
      ]).then(([cooling, stale, receivables, partyFin]) =>
        setCrmAlerts([...partyFin, ...receivables, ...stale, ...cooling])
      );
    load();
    const crmInterval = setInterval(load, 5 * 60_000);
    return () => clearInterval(crmInterval);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(), 60_000);
    // atualiza na hora quando o app sinaliza mudança de dados ou a janela volta ao foco
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener(DATA_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Variedade (não-vistos primeiro) e DEPOIS ordena por severidade — crítico no
  // topo (sort estável preserva a ordem de variedade dentro de cada camada).
  const allAlerts = mergeAndReorder([alerts, crmAlerts]).sort(
    (a, b) => SEVERITY_ORDER[alertSeverity(a)] - SEVERITY_ORDER[alertSeverity(b)]
  );
  const criticalCount = allAlerts.filter((a) => alertSeverity(a) === "critico").length;
  const totalCount = allAlerts.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          refresh();
        }}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-accent",
          open && "bg-accent"
        )}
        aria-label="Alertas"
      >
        <Bell className="h-4 w-4" />
        {totalCount > 0 && (
          <span
            className={cn(
              "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
              criticalCount > 0 ? "bg-red-500" : "bg-amber-500"
            )}
          >
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-popover shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Alertas
          </div>
          {perm === "default" && (
            <button
              type="button"
              onClick={async () => {
                const granted = await enableNotifications();
                setPerm(await checkNotificationPermission());
                if (granted) {
                  await sendTestNotification();
                  toast.success("Notificações ativadas. Se nada aparecer, confira as notificações do Vistage nas configurações do sistema.");
                } else {
                  toast.error("Permissão negada. Ative as notificações do Vistage nas configurações do sistema.");
                }
              }}
              className="flex w-full items-center gap-2 border-b bg-primary/5 px-3 py-2 text-left text-xs text-primary transition hover:bg-primary/10"
            >
              <BellRing className="h-3.5 w-3.5 shrink-0" />
              Ativar notificações do sistema para alertas críticos
            </button>
          )}
          {allAlerts.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              Tudo em ordem.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {allAlerts.map((a) => {
                const staleMatch = a.key.match(/^gig-stale-status-(\d+)$/);
                const staleGigId = staleMatch ? Number(staleMatch[1]) : null;
                const sev = alertSeverity(a);
                return (
                  <div
                    key={a.key}
                    className={cn(
                      "border-b px-3 py-2.5 text-sm last:border-0",
                      sev === "critico" && "bg-red-500/5",
                      sev === "atencao" && "bg-amber-500/5"
                    )}
                  >
                    <Link
                      to={a.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 transition hover:text-primary",
                        sev !== "info" && "font-medium"
                      )}
                    >
                      <span className="shrink-0">
                        <AlertIcon icon={a.icon} critical={sev === "critico"} />
                      </span>
                      <span className="flex-1 leading-tight">{a.label}</span>
                    </Link>
                    {staleGigId && (
                      <div className="mt-1.5 flex gap-1.5 pl-7">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                          onClick={async () => {
                            await updateGig({ id: staleGigId, status: "Concluída" });
                            emitDataChanged();
                            setOpen(false);
                          }}
                        >
                          Marcar Concluída
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                          onClick={async () => {
                            await updateGig({ id: staleGigId, status: "Cancelada" });
                            emitDataChanged();
                            setOpen(false);
                          }}
                        >
                          Marcar Cancelada
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                          onClick={() => { navigate(a.to); setOpen(false); }}
                        >
                          Abrir GIG
                        </button>
                      </div>
                    )}
                    {a.dismissible && (
                      <div className="mt-1.5 pl-7">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                          onClick={async () => {
                            await snoozeAlert(a.key, 24 * 365);
                            setOpen(false);
                          }}
                        >
                          Dispensar
                        </button>
                      </div>
                    )}
                    {a.coolingRefs && a.coolingRefs.length > 0 && (
                      <div className="mt-1.5 pl-7">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                          onClick={() => void ackCooling(a.coolingRefs!)}
                        >
                          Deixar esfriar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
