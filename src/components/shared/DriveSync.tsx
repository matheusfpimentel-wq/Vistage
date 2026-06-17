import { useEffect, useRef } from "react";
import { DATA_CHANGED } from "@/lib/events";
import { pushToTurso } from "@/lib/db";
import { useConfigStore } from "@/lib/config";
import { DEFAULT_TURSO_TOKEN, DEFAULT_TURSO_URL } from "@/lib/turso-defaults";
import { toast } from "@/components/ui/toaster";

const THROTTLE_MS = 60 * 1000; // aguarda 1 min após última mudança antes de enviar
const WARN_AFTER_FAILURES = 3;

export function DriveSync() {
  const { config } = useConfigStore();
  const ranBoot = useRef(false);
  const lastSync = useRef<number>(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const warned = useRef(false);
  const syncRunning = useRef(false);

  const runSync = async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    try {
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      await pushToTurso(tursoUrl, tursoToken);
      lastSync.current = Date.now();
      failures.current = 0;
      if (warned.current) {
        warned.current = false;
        toast.success("Conexão com a nuvem restabelecida — dados sincronizados.");
      }
      window.dispatchEvent(new CustomEvent("vistage:sync-result", { detail: { ok: true } }));
    } catch {
      failures.current += 1;
      if (failures.current >= WARN_AFTER_FAILURES && !warned.current) {
        warned.current = true;
        toast.error(
          "Não está sincronizando com a nuvem. Suas mudanças estão salvas só nesta máquina — " +
            "verifique a internet antes de trocar de computador para não perder dados."
        );
      }
      window.dispatchEvent(new CustomEvent("vistage:sync-result", { detail: { ok: false } }));
    } finally {
      syncRunning.current = false;
    }
  };

  // sync no boot
  useEffect(() => {
    if (ranBoot.current) return;
    ranBoot.current = true;
    void runSync();
  }, []);

  // sync 1 min após cada mudança de dados (debounce: reinicia o timer a cada
  // nova mudança, então edições rápidas agrupam em um único envio)
  useEffect(() => {
    const onChange = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        void runSync();
      }, THROTTLE_MS);
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED, onChange);
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  // ao minimizar/ocultar janela: envia imediatamente sem esperar o minuto
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void runSync();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return null;
}
