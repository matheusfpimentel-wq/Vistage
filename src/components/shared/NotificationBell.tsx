import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, BookOpen, Clock, Flame, Heart, Music, PartyPopper, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { loadWeekStats, type WeekStats } from "@/modules/revisao/api";
import { DATA_CHANGED } from "@/lib/events";

type Alert = { icon: React.ReactNode; label: string; to: string; critical: boolean };

function buildAlerts(stats: WeekStats): Alert[] {
  const alerts: Alert[] = [];

  if (stats.tasksOverdue > 0)
    alerts.push({ icon: <Clock className="h-3.5 w-3.5 text-red-500" />, label: `${stats.tasksOverdue} tarefa${stats.tasksOverdue > 1 ? "s" : ""} atrasada${stats.tasksOverdue > 1 ? "s" : ""}`, to: "/tarefas", critical: true });
  if (stats.pendingDebriefs > 0)
    alerts.push({ icon: <Star className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.pendingDebriefs} debrief${stats.pendingDebriefs > 1 ? "s" : ""} de GIG pendente${stats.pendingDebriefs > 1 ? "s" : ""}`, to: "/gigs", critical: true });
  if (stats.hotIdeasStuck > 0)
    alerts.push({ icon: <Flame className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.hotIdeasStuck} ideia${stats.hotIdeasStuck > 1 ? "s" : ""} quente${stats.hotIdeasStuck > 1 ? "s" : ""} parada${stats.hotIdeasStuck > 1 ? "s" : ""} em Embrião +15d`, to: "/ideias", critical: true });
  if (stats.stalledTracks > 0)
    alerts.push({ icon: <Music className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.stalledTracks} track${stats.stalledTracks > 1 ? "s" : ""} sem movimento há +15 dias`, to: "/musica", critical: false });
  if (stats.stalledParties > 0)
    alerts.push({ icon: <PartyPopper className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.stalledParties} festa${stats.stalledParties > 1 ? "s" : ""} sem movimento há +15 dias`, to: "/festas", critical: false });
  if (stats.stalledContent > 0)
    alerts.push({ icon: <Clock className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.stalledContent} conteúdo${stats.stalledContent > 1 ? "s" : ""} sem movimento há +15 dias`, to: "/conteudo", critical: false });
  if (stats.undatedParties > 0)
    alerts.push({ icon: <PartyPopper className="h-3.5 w-3.5 text-muted-foreground" />, label: `${stats.undatedParties} festa${stats.undatedParties > 1 ? "s" : ""} sem data definida`, to: "/festas", critical: false });
  if (stats.noUpcomingGigs)
    alerts.push({ icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />, label: "Nenhuma GIG marcada à frente", to: "/gigs", critical: false });
  if (stats.noTracksInProduction)
    alerts.push({ icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />, label: "Nenhuma música em produção", to: "/musica", critical: false });
  if (stats.unpreparedClasses > 0)
    alerts.push({ icon: <BookOpen className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.unpreparedClasses} aula${stats.unpreparedClasses > 1 ? "s" : ""} não preparada${stats.unpreparedClasses > 1 ? "s" : ""} em breve`, to: "/aulas", critical: false });
  if (stats.superfasSemInteracao > 0)
    alerts.push({ icon: <Heart className="h-3.5 w-3.5 text-amber-500" />, label: `${stats.superfasSemInteracao} superfã${stats.superfasSemInteracao > 1 ? "s" : ""} sem interação nos últimos 30 dias`, to: "/fas", critical: false });

  return alerts;
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const stats = await loadWeekStats();
      setAlerts(buildAlerts(stats));
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    // atualiza na hora quando o app sinaliza mudança de dados ou a janela volta ao foco
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      clearInterval(interval);
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
          void refresh();
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
              {alerts.map((a, i) => (
                <Link
                  key={i}
                  to={a.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 border-b px-3 py-2.5 text-sm transition last:border-0 hover:bg-accent",
                    a.critical && "bg-red-500/5"
                  )}
                >
                  <span className="shrink-0">{a.icon}</span>
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
