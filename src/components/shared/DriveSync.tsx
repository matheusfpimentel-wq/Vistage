import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED } from "@/lib/events";
import {
  loadAuth,
  maybeAutoBackupAfterChange,
  restoreLatestBackupSilently,
  uploadBackup,
} from "@/lib/gdrive";

const THROTTLE_MS = 5 * 60 * 1000; // 5 minutos entre uploads automáticos

export function DriveSync() {
  const ranBoot = useRef(false);
  const lastUpload = useRef<number>(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ranBoot.current) return;
    ranBoot.current = true;
    void (async () => {
      try {
        const auth = await loadAuth();
        if (auth?.autoBackup) {
          const restored = await restoreLatestBackupSilently();
          if (restored) toast.success("Dados sincronizados do Drive");
          await uploadBackup().catch(() => {});
          lastUpload.current = Date.now();
        }
      } catch {
        // silencioso: Drive offline não deve travar o app
      }
    })();
  }, []);

  // Throttle real: agrupa mudanças num intervalo de até 5 minutos.
  // Se a última subida foi há menos de THROTTLE_MS, agenda para quando o
  // prazo expirar. Assim nenhum upload acontece mais de uma vez a cada 5 min.
  useEffect(() => {
    const onChange = () => {
      if (pending.current) return; // já tem upload agendado
      const now = Date.now();
      const elapsed = now - lastUpload.current;
      const delay = elapsed >= THROTTLE_MS ? 0 : THROTTLE_MS - elapsed;
      pending.current = setTimeout(() => {
        pending.current = null;
        void maybeAutoBackupAfterChange()
          .then(() => {
            lastUpload.current = Date.now();
            window.dispatchEvent(new CustomEvent('vistage:sync-result', { detail: { ok: true } }));
          })
          .catch(() => {
            window.dispatchEvent(new CustomEvent('vistage:sync-result', { detail: { ok: false } }));
          });
      }, delay);
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED, onChange);
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  return null;
}
