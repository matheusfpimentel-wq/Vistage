import { useEffect, useRef, useState } from "react";
import { Check, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { DATA_CHANGED } from "@/lib/events";
import { loadAuth, uploadBackup } from "@/lib/gdrive";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

type SyncState = "idle" | "syncing" | "error";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/**
 * Indicador de sincronização com o Google Drive. Fixo no canto inferior
 * esquerdo. Clicável em estado de erro para tentar novamente.
 *
 * Lógica do pulso "Sincronizando…":
 *  - DATA_CHANGED dispara o estado syncing.
 *  - Espera 12s (tempo suficiente para o upload terminar em conexões lentas).
 *  - Relê lastBackupAt: se avançou → idle; se não avançou → error.
 *  - Atualização periódica do tempo relativo a cada 60s.
 */
export function SyncIndicator() {
  const [connected, setConnected] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [state, setState] = useState<SyncState>("idle");
  const [retrying, setRetrying] = useState(false);
  const syncTimer = useRef<number | null>(null);
  const prevBackupRef = useRef<string | null>(null);

  const readAuth = async () => {
    try {
      const auth = await loadAuth();
      if (auth?.autoBackup) {
        setConnected(true);
        setLastBackupAt(auth.lastBackupAt ?? null);
        prevBackupRef.current = auth.lastBackupAt ?? null;
        return true;
      }
      setConnected(false);
      return false;
    } catch {
      setConnected(false);
      return false;
    }
  };

  useEffect(() => {
    void readAuth();
    const id = window.setInterval(() => void readAuth(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onResult = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail.ok;
      void readAuth().then(() => setState(ok ? "idle" : "error"));
    };
    window.addEventListener('vistage:sync-result', onResult);
    return () => window.removeEventListener('vistage:sync-result', onResult);
  }, []);

  useEffect(() => {
    const onChange = () => {
      void (async () => {
        const ok = await readAuth();
        if (!ok) return;
        setState("syncing");
        if (syncTimer.current) window.clearTimeout(syncTimer.current);
        // 12s fallback — if no sync-result event fires, go back to idle
        syncTimer.current = window.setTimeout(() => {
          void (async () => {
            try {
              const auth = await loadAuth();
              const now = auth?.lastBackupAt ?? null;
              setLastBackupAt(now);
              prevBackupRef.current = now;
              // Only go to idle — the sync-result event is the authoritative error source
              setState("idle");
            } catch {
              setState("idle");
            }
          })();
        }, 12_000);
      })();
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED, onChange);
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, []);

  async function handleRetry() {
    if (retrying || state === "syncing") return;
    setRetrying(true);
    setState("syncing");
    try {
      await uploadBackup();
      await readAuth();
      setState("idle");
      toast.success("Sincronizado com o Drive");
    } catch (e) {
      setState("error");
      toast.error(`Erro ao sincronizar: ${String(e)}`);
    } finally {
      setRetrying(false);
    }
  }

  if (!connected) return null;

  const isError = state === "error";
  const isSyncing = state === "syncing" || retrying;
  const detail = timeAgo(lastBackupAt);

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

      {isError && !retrying && (
        <RefreshCw className="h-3 w-3 text-destructive/70" />
      )}
    </button>
  );
}
