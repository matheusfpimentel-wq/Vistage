import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, CheckCircle2, ChevronRight, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "./api";
import { alertSeverity, computeAlerts, SEVERITY_LABEL, type AlertItem, type AlertSeverity } from "./alerts";
import { getDisabledRuleIds, isPauseMode, setPauseMode } from "./ruleConfig";
import { evaluateCustomRules } from "./customRules";
import { loadPartyFinanceAlerts } from "./partyFinanceAlerts";
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
  const [paused, setPaused] = useState(isPauseMode());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const [stats, custom, partyFin] = await Promise.all([
          loadWeekStats(),
          evaluateCustomRules(),
          loadPartyFinanceAlerts(),
        ]);
        setAlerts(
          await filterSnoozed([
            ...computeAlerts(stats, undefined, getDisabledRuleIds(), isPauseMode()),
            ...custom,
            ...partyFin,
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

  const groups: Record<AlertSeverity, AlertItem[]> = { critico: [], atencao: [], info: [] };
  for (const a of alerts) groups[alertSeverity(a)].push(a);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Alertas & Recomendações</h1>
          <p className="text-sm text-muted-foreground">
            {alerts.length === 0
              ? "Tudo em ordem por aqui."
              : `${groups.critico.length} crítico${groups.critico.length === 1 ? "" : "s"} · ${groups.atencao.length} de atenção · ${groups.info.length} informativo${groups.info.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !paused;
              setPaused(next);
              setPauseMode(next);
              refresh();
            }}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition",
              paused
                ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "text-muted-foreground hover:bg-accent"
            )}
            title="Modo pausa — suspende alertas de pipeline/continuidade (mantém dinheiro e prazo)"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Pausado" : "Pausar"}
          </button>
          <button
            type="button"
            onClick={refresh}
            className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
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
          {(["critico", "atencao", "info"] as AlertSeverity[]).map((sev) =>
            groups[sev].length > 0 ? (
              <AlertSection
                key={sev}
                title={SEVERITY_LABEL[sev] + (sev === "info" ? "" : sev === "critico" ? "s" : "")}
                severity={sev}
                items={groups[sev]}
                onDismiss={dismiss}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function AlertSection({
  title,
  severity,
  items,
  onDismiss,
}: {
  title: string;
  severity: AlertSeverity;
  items: AlertItem[];
  onDismiss: (key: string) => void;
}) {
  const rowBg = severity === "critico" ? "bg-red-500/5" : severity === "atencao" ? "bg-amber-500/5" : "";
  const dot = severity === "critico" ? "bg-red-500" : severity === "atencao" ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {title}
      </h2>
      <div className="overflow-hidden rounded-lg border">
        {items.map((a) => (
          <div key={a.key} className={cn("flex items-center border-b last:border-0", rowBg)}>
            <Link
              to={a.to}
              className="flex flex-1 items-center gap-3 px-4 py-3.5 text-sm transition hover:bg-accent active:bg-accent"
            >
              <span className="shrink-0">
                <AlertIcon icon={a.icon} critical={severity === "critico"} className="h-5 w-5" />
              </span>
              <span className={cn("flex-1 leading-snug", severity !== "info" && "font-medium")}>
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
