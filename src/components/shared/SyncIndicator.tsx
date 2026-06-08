import { useEffect, useRef, useState } from "react";
import { Check, Cloud, CloudOff, Loader2 } from "lucide-react";
import { DATA_CHANGED } from "@/lib/events";
import { loadAuth } from "@/lib/gdrive";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "error";

/** Tempo relativo curto em pt-BR (ex.: "agora", "há 5 min", "há 2 h"). */
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
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

/**
 * Indicador discreto de sincronização com o Google Drive, fixo no canto
 * inferior esquerdo. Só aparece se o auto-backup estiver ligado. Reflete o
 * último backup (auth.lastBackupAt) e mostra um pulso "Sincronizando…"
 * transitório quando dados mudam (DATA_CHANGED).
 */
export function SyncIndicator() {
  const [connected, setConnected] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [state, setState] = useState<SyncState>("idle");
  const syncTimer = useRef<number | null>(null);

  const refresh = async () => {
    try {
      const auth = await loadAuth();
      if (auth?.autoBackup) {
        setConnected(true);
        setLastBackupAt(auth.lastBackupAt ?? null);
        return true;
      }
      setConnected(false);
      return false;
    } catch {
      setConnected(false);
      return false;
    }
  };

  // Carga inicial + atualização periódica do tempo relativo.
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(id);
  }, []);

  // Pulso "Sincronizando…" em mudanças de dados; depois volta a idle e relê o
  // timestamp do último backup.
  useEffect(() => {
    const onChange = () => {
      void (async () => {
        const ok = await refresh();
        if (!ok) return;
        setState("syncing");
        if (syncTimer.current) window.clearTimeout(syncTimer.current);
        syncTimer.current = window.setTimeout(() => {
          void (async () => {
            try {
              const auth = await loadAuth();
              const prev = lastBackupAt;
              const now = auth?.lastBackupAt ?? null;
              setLastBackupAt(now);
              // Se o backup não avançou, sinaliza erro de sync.
              setState(now && now !== prev ? "idle" : prev ? "error" : "idle");
            } catch {
              setState("error");
            }
          })();
        }, 2500);
      })();
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED, onChange);
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [lastBackupAt]);

  if (!connected) return null;

  let icon = <Cloud className="h-3.5 w-3.5 text-emerald-500" />;
  let label = "Sincronizado";
  let detail = timeAgo(lastBackupAt);

  if (state === "syncing") {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
    label = "Sincronizando…";
    detail = "";
  } else if (state === "error") {
    icon = <CloudOff className="h-3.5 w-3.5 text-destructive" />;
    label = "Erro de sync";
    detail = "";
  }

  return (
    <div
      className={cn(
        "fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full",
        "border bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground",
        "shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "pointer-events-none select-none"
      )}
      aria-live="polite"
    >
      {icon}
      <span className="font-medium">{label}</span>
      {state === "idle" && detail && (
        <span className="flex items-center gap-1 text-muted-foreground/70">
          <Check className="h-3 w-3" />
          {detail}
        </span>
      )}
    </div>
  );
}
