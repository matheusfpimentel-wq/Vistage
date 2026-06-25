import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DATA_CHANGED } from "@/lib/events";
import { countOpenTasksByEntity } from "../api";

/**
 * Compartilha as contagens de tarefas abertas de um tipo de entidade entre todos
 * os <PendingTasksBadge> de uma tela de lista — uma única query agrupada no lugar
 * de N (uma por selo). Quando NÃO há provider, o selo cai no fallback (query
 * própria por entidade), então nenhum uso fora de uma lista quebra.
 */
type Ctx = { entityType: string; counts: Map<number, number> };

const PendingTasksContext = createContext<Ctx | null>(null);

export function PendingTasksProvider({
  entityType,
  children,
}: {
  entityType: string;
  children: ReactNode;
}) {
  const [counts, setCounts] = useState<Map<number, number>>(() => new Map());

  useEffect(() => {
    let alive = true;
    function load() {
      void countOpenTasksByEntity(entityType)
        .then((m) => {
          if (alive) setCounts(m);
        })
        .catch(() => {
          /* contagem é só um selo; falha não deve derrubar a lista */
        });
    }
    load();
    window.addEventListener(DATA_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(DATA_CHANGED, load);
    };
  }, [entityType]);

  return (
    <PendingTasksContext.Provider value={{ entityType, counts }}>
      {children}
    </PendingTasksContext.Provider>
  );
}

/**
 * Contagem vinda do provider mais próximo, se ele cobre este `entityType`.
 * Retorna `null` quando não há provider compatível — sinal para o selo fazer a
 * própria query (fallback, comportamento antigo).
 */
export function usePendingTasksCount(
  entityType: string,
  entityId: number
): number | null {
  const ctx = useContext(PendingTasksContext);
  if (!ctx || ctx.entityType !== entityType) return null;
  return ctx.counts.get(entityId) ?? 0;
}
