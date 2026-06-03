import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED } from "@/lib/events";
import {
  loadAuth,
  maybeAutoBackupAfterChange,
  restoreLatestBackupSilently,
  uploadBackup,
} from "@/lib/gdrive";

/**
 * Coordena a sincronização com o Google Drive sem UI fixa:
 * - No boot, se auto-backup ligado: restaura silenciosamente o backup mais
 *   recente e depois sobe um backup do estado atual.
 * - No boot, se auto-backup desligado: comportamento antigo (nada no boot).
 * - Após mudanças de dados, sobe backup com throttle (se ligado).
 *
 * Não renderiza nada visível.
 */
export function DriveSync() {
  const ranBoot = useRef(false);

  // Boot: restore silencioso (auto-backup ligado) ou backup de abertura
  useEffect(() => {
    if (ranBoot.current) return;
    ranBoot.current = true;
    void (async () => {
      try {
        const auth = await loadAuth();
        if (auth?.autoBackup) {
          const restored = await restoreLatestBackupSilently();
          if (restored) {
            toast.success("Dados sincronizados do Drive");
          }
          await uploadBackup().catch(() => {});
        }
      } catch {
        // silencioso: Drive desconectado ou offline não deve travar o app
      }
    })();
  }, []);

  // Backup automático com throttle após mudanças de dados
  useEffect(() => {
    const onChange = () => {
      void maybeAutoBackupAfterChange().catch(() => {});
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, []);

  return null;
}
