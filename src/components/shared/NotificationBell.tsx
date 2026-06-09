import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "@/modules/revisao/api";
import { computeAlerts, type AlertItem } from "@/modules/revisao/alerts";
import { filterSnoozed } from "@/modules/revisao/snooze";
import { AlertIcon } from "@/modules/revisao/alertIcons";
import { enableNotifications, notificationPermission } from "@/lib/notify";
import { DATA_CHANGED } from "@/lib/events";
import { getDb } from "@/lib/db";

async function loadRelationshipAlerts(): Promise<AlertItem[]> {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    const rows = await db.select<{ id: number; name: string }[]>(
      `SELECT id, name FROM contacts WHERE (rating >= 4) AND (last_interaction_at IS NULL OR last_interaction_at < $1) ORDER BY rating DESC LIMIT 3`,
      [cutoff]
    );
    return rows.map((c) => ({
      key: `crm-radar-${c.id}`,
      label: `Faz mais de 45 dias sem contato com ${c.name}. Boa hora para retomar.`,
      to: `/crm?open=${c.id}`,
      critical: false,
      icon: "heart" as const,
    }));
  } catch {
    return [];
  }
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [crmAlerts, setCrmAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    notificationPermission()
  );
  const ref = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const stats = await loadWeekStats();
        setAlerts(await filterSnoozed(computeAlerts(stats)));
      } catch {
        // silently ignore
      }
      void loadRelationshipAlerts().then(setCrmAlerts);
    }, 500);
  }, []);

  useEffect(() => {
    void loadRelationshipAlerts().then(setCrmAlerts);
    const crmInterval = setInterval(() => void loadRelationshipAlerts().then(setCrmAlerts), 5 * 60_000);
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

  const allAlerts = [...alerts, ...crmAlerts];
  const criticalCount = allAlerts.filter((a) => a.critical).length;
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
                await enableNotifications();
                setPerm(notificationPermission());
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
              {allAlerts.map((a) => (
                <Link
                  key={a.key}
                  to={a.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 border-b px-3 py-2.5 text-sm transition last:border-0 hover:bg-accent",
                    a.critical && "bg-red-500/5"
                  )}
                >
                  <span className="shrink-0">
                    <AlertIcon icon={a.icon} critical={a.critical} />
                  </span>
                  <span className={cn("flex-1 leading-tight", a.critical && "font-medium")}>
                    {a.label}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
