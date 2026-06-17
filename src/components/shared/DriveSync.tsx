import { useEffect, useRef } from "react";
import { DATA_CHANGED } from "@/lib/events";
import { syncDatabase } from "@/lib/db";
import { toast } from "@/components/ui/toaster";

const THROTTLE_MS = 30 * 1000; // no máx. um sync por mudança a cada 30s
const PERIODIC_MS = 2 * 60 * 1000; // fallback: sync a cada 2 min mesmo sem mudança
const WARN_AFTER_FAILURES = 3; // avisa o usuário após 3 falhas seguidas

/**
 * Sincronização com o Turso. O banco escreve localmente (offline) e este
 * componente empurra/puxa mudanças via syncDatabase():
 *  - uma vez ao abrir o app;
 *  - após cada mudança de dados (DATA_CHANGED), com throttle;
 *  - periodicamente (fallback), garantindo que nada fique preso na réplica
 *    local mesmo que um evento de mudança escape;
 *  - quando a janela é ocultada/minimizada (melhor esforço antes de o usuário
 *    sair).
 *
 * O fechamento da janela dispara um sync no lado Rust (on_window_event), que é
 * a rede de segurança principal contra perda de escritas recentes.
 *
 * O resultado é publicado no evento `vistage:sync-result` para o indicador, e
 * falhas repetidas viram um aviso visível (antes eram silenciosas).
 */
export function DriveSync() {
  const ranBoot = useRef(false);
  const lastSync = useRef<number>(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const warned = useRef(false);

  const runSync = async () => {
    try {
      await syncDatabase();
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
    }
  };

  // sync no boot
  useEffect(() => {
    if (ranBoot.current) return;
    ranBoot.current = true;
    void runSync();
  }, []);

  // sync após mudanças (com throttle)
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

  // fallback periódico: garante que nada fique preso na réplica local
  useEffect(() => {
    const id = window.setInterval(() => {
      // evita rodar logo após um sync recente
      if (Date.now() - lastSync.current < PERIODIC_MS) return;
      void runSync();
    }, PERIODIC_MS);
    return () => window.clearInterval(id);
  }, []);

  // ao ocultar/minimizar a janela, empurra o que houver (melhor esforço)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void runSync();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return null;
}
