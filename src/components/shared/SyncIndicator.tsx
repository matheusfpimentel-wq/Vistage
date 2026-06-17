import { useEffect, useRef, useState } from "react";
import { Check, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { pushToTurso } from "@/lib/db";
import { useConfigStore } from "@/lib/config";
import { DEFAULT_TURSO_TOKEN, DEFAULT_TURSO_URL } from "@/lib/turso-defaults";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

type SyncState = "idle" | "syncing" | "error";

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/**
 * Indicador de sincronização com o Turso. Fixo no canto inferior esquerdo.
 * O sync é disparado pelo DriveSync (no boot e após mudanças); aqui apenas
 * refletimos o estado via evento `vistage:sync-result` e DATA_CHANGED.
 * Clicável em estado de erro para tentar sincronizar de novo.
 */
export function SyncIndicator() {
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [state, setState] = useState<SyncState>("idle");
  const [retrying, setRetrying] = useState(false);
  const syncTimer = useRef<number | null>(null);

  // tempo relativo atualiza a cada 60s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onResult = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail.ok;
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      if (ok) {
        setLastSyncAt(Date.now());
        setState("idle");
      } else {
        setState("error");
      }
    };
    window.addEventListener("vistage:sync-result", onResult);
    return () => window.removeEventListener("vistage:sync-result", onResult);
  }, []);

  // O DriveSync emite "sync-start" quando começa a enviar de fato (após o
  // debounce de 1 min). Refletimos esse início — não o DATA_CHANGED, que vem
  // imediatamente na edição, antes do envio.
  useEffect(() => {
    const onStart = () => {
      setState("syncing");
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      // fallback: se nenhum resultado chegar em 60s, volta a idle
      syncTimer.current = window.setTimeout(() => setState("idle"), 60_000);
    };
    window.addEventListener("vistage:sync-start", onStart);
    return () => {
      window.removeEventListener("vistage:sync-start", onStart);
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, []);

  async function handleRetry() {
    if (retrying || state === "syncing") return;
    setRetrying(true);
    setState("syncing");
    try {
      const { config } = useConfigStore.getState();
      await pushToTurso(
        config?.tursoUrl ?? DEFAULT_TURSO_URL,
        config?.tursoToken ?? DEFAULT_TURSO_TOKEN
      );
      setLastSyncAt(Date.now());
      setState("idle");
      toast.success("Salvo na nuvem");
    } catch (e) {
      setState("error");
      toast.error(`Erro ao salvar na nuvem: ${String(e)}`);
    } finally {
      setRetrying(false);
    }
  }

  const isError = state === "error";
  const isSyncing = state === "syncing" || retrying;
  const detail = timeAgo(lastSyncAt);

  return (
    <button
      type="button"
      onClick={isError ? handleRetry : undefined}
      disabled={isSyncing}
      className={cn(
        "fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full",
        "border bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground",
        "shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "select-none transition-colors",
        isError
          ? "cursor-pointer border-destructive/40 hover:bg-destructive/10"
          : "cursor-default pointer-events-none"
      )}
      aria-live="polite"
      title={isError ? "Clique para tentar sincronizar novamente" : undefined}
    >
      {isSyncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : isError ? (
        <CloudOff className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <Cloud className="h-3.5 w-3.5 text-emerald-500" />
      )}

      <span className={cn("font-medium", isError && "text-destructive")}>
        {isSyncing ? "Sincronizando…" : isError ? "Erro de sync" : "Sincronizado"}
      </span>

      {!isSyncing && !isError && detail && (
        <span className="flex items-center gap-1 text-muted-foreground/70">
          <Check className="h-3 w-3" />
          {detail}
        </span>
      )}

      {isError && !retrying && <RefreshCw className="h-3 w-3 text-destructive/70" />}
    </button>
  );
}
