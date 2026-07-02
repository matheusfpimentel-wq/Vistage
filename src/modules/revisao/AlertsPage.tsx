import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadWeekStats } from "./api";
import { alertSeverity, computeAlerts, SEVERITY_BUCKET_LABEL, type AlertItem, type AlertSeverity } from "./alerts";
import { getDisabledRuleIds } from "./ruleConfig";
import { getHiddenModules } from "@/lib/moduleVisibility";
import { evaluateCustomRules } from "./customRules";
import { loadPartyFinanceAlerts } from "./partyFinanceAlerts";
import { alertSignature, dismissAlertUntilChange, filterDismissed, filterSnoozed } from "./snooze";
import { ackCooling, loadCoolingAlerts } from "./cooling";
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
        const [stats, custom, partyFin, cooling] = await Promise.all([
          loadWeekStats(),
          evaluateCustomRules(),
          loadPartyFinanceAlerts(),
          loadCoolingAlerts(),
        ]);
        setAlerts(
          await filterDismissed(
            await filterSnoozed([
              ...computeAlerts(stats, undefined, getDisabledRuleIds(), getHiddenModules()),
              ...custom,
              ...partyFin,
              ...cooling,
            ])
          )
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

  const dismiss = useCallback((a: AlertItem) => {
    setAlerts((prev) => prev.filter((x) => x.key !== a.key)); // some na hora
    // "Esfriando" → registra os itens como aceitos (some até alimentar de novo).
    // Demais alertas → dispensa até a situação mudar (volta ao disparar de novo).
    if (a.coolingRefs && a.coolingRefs.length > 0) void ackCooling(a.coolingRefs);
    else void dismissAlertUntilChange(a.key, alertSignature(a));
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
            Quando algo precisar da sua atenção (GIG sem prep, cachê pendente,
            tarefa atrasada), aparece aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {(["critico", "atencao", "info"] as AlertSeverity[]).map((sev) =>
            groups[sev].length > 0 ? (
              <AlertSection
                key={sev}
                title={SEVERITY_BUCKET_LABEL[sev]}
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
  onDismiss: (item: AlertItem) => void;
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
              onClick={() => onDismiss(a)}
              className="flex h-9 w-9 shrink-0 items-center justify-center self-stretch text-muted-foreground/60 transition hover:text-foreground"
              title={a.coolingRefs ? "Deixar esfriar" : "Dispensar até disparar de novo"}
              aria-label={a.coolingRefs ? "Deixar esfriar" : "Dispensar alerta até disparar de novo"}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
