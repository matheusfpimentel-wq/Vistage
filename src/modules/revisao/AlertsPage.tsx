import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, CheckCircle2, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "./api";
import { computeAlerts, type AlertItem } from "./alerts";
import { getDisabledRuleIds } from "./ruleConfig";
import { evaluateCustomRules } from "./customRules";
import { filterSnoozed, snoozeAlert } from "./snooze";
import { AlertIcon } from "./alertIcons";
import { DATA_CHANGED } from "@/lib/events";

/**
 * Tela cheia de Alertas & Recomendações — pensada para o app mobile, onde é a
 * home. Mostra os alertas críticos primeiro, depois as recomendações.
 * Reaproveita o mesmo núcleo (`computeAlerts`) do sininho e do futuro push.
 */
export function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const [stats, custom] = await Promise.all([loadWeekStats(), evaluateCustomRules()]);
        setAlerts(
          await filterSnoozed([
            ...computeAlerts(stats, undefined, getDisabledRuleIds()),
            ...custom,
          ])
        );
      } catch {
        /* silently ignore */
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener(DATA_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  const dismiss = useCallback((key: string) => {
    void snoozeAlert(key);
  }, []);

  const critical = alerts.filter((a) => a.critical);
  const recommendations = alerts.filter((a) => !a.critical);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Alertas & Recomendações</h1>
          <p className="text-sm text-muted-foreground">
            {alerts.length === 0
              ? "Tudo em ordem por aqui."
              : `${critical.length} crítico${critical.length === 1 ? "" : "s"} · ${recommendations.length} recomendaç${recommendations.length === 1 ? "ão" : "ões"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
          aria-label="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="text-sm font-medium">Nenhum alerta no momento</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Quando algo precisar da sua atenção — GIG sem prep, cachê pendente,
            tarefa atrasada — aparece aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {critical.length > 0 && (
            <AlertSection title="Críticos" items={critical} onDismiss={dismiss} />
          )}
          {recommendations.length > 0 && (
            <AlertSection title="Recomendações" items={recommendations} onDismiss={dismiss} />
          )}
        </div>
      )}
    </div>
  );
}

function AlertSection({
  title,
  items,
  onDismiss,
}: {
  title: string;
  items: AlertItem[];
  onDismiss: (key: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="overflow-hidden rounded-lg border">
        {items.map((a) => (
          <div
            key={a.key}
            className={cn(
              "flex items-center border-b last:border-0",
              a.critical && "bg-red-500/5"
            )}
          >
            <Link
              to={a.to}
              className="flex flex-1 items-center gap-3 px-4 py-3.5 text-sm transition hover:bg-accent active:bg-accent"
            >
              <span className="shrink-0">
                <AlertIcon icon={a.icon} critical={a.critical} className="h-5 w-5" />
              </span>
              <span className={cn("flex-1 leading-snug", a.critical && "font-medium")}>
                {a.label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
            <button
              type="button"
              onClick={() => onDismiss(a.key)}
              className="flex h-9 w-9 shrink-0 items-center justify-center self-stretch text-muted-foreground/60 transition hover:text-foreground"
              title="Dispensar por 24h"
              aria-label="Dispensar alerta por 24 horas"
            >
              <BellOff className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
