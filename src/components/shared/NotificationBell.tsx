import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "@/modules/revisao/api";
import { computeAlerts, type AlertItem } from "@/modules/revisao/alerts";
import { AlertIcon } from "@/modules/revisao/alertIcons";
import { DATA_CHANGED } from "@/lib/events";

export function NotificationBell() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const stats = await loadWeekStats();
        setAlerts(computeAlerts(stats));
      } catch {
        // silently ignore
      }
    }, 500);
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

  const criticalCount = alerts.filter((a) => a.critical).length;
  const totalCount = alerts.length;

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
          {alerts.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              Tudo em ordem.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {alerts.map((a) => (
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
