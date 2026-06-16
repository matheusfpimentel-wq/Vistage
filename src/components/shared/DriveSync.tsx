import { useEffect, useRef } from "react";
import { DATA_CHANGED } from "@/lib/events";
import { syncDatabase } from "@/lib/db";

const THROTTLE_MS = 30 * 1000; // no máx. um sync a cada 30s

/**
 * Sincronização com o Turso. O banco escreve localmente (offline) e este
 * componente empurra/puxa mudanças via syncDatabase():
 *  - uma vez ao abrir o app;
 *  - após cada mudança de dados (DATA_CHANGED), com throttle.
 * O resultado é publicado no evento `vistage:sync-result` para o indicador.
 */
export function DriveSync() {
  const ranBoot = useRef(false);
  const lastSync = useRef<number>(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSync = async () => {
    try {
      await syncDatabase();
      lastSync.current = Date.now();
      window.dispatchEvent(new CustomEvent("vistage:sync-result", { detail: { ok: true } }));
    } catch {
      window.dispatchEvent(new CustomEvent("vistage:sync-result", { detail: { ok: false } }));
    }
  };

  useEffect(() => {
    if (ranBoot.current) return;
    ranBoot.current = true;
    void runSync();
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (pending.current) return; // já agendado
      const elapsed = Date.now() - lastSync.current;
      const delay = elapsed >= THROTTLE_MS ? 0 : THROTTLE_MS - elapsed;
      pending.current = setTimeout(() => {
        pending.current = null;
        void runSync();
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
