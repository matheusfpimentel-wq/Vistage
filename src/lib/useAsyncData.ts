import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncData<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Recarrega os dados (ex.: botão "Tentar novamente" ou após um CRUD). */
  reload: () => void;
};

/**
 * Carrega dados assíncronos com estados de loading/erro e cancelamento.
 *
 * Resolve de uma vez três problemas que se repetiam nas páginas:
 *  - ausência de feedback de loading/erro;
 *  - race condition ao trocar de registro/aba (resposta antiga sobrescrevia a
 *    nova) — aqui a resposta de uma chamada obsoleta é descartada;
 *  - `setState` após desmontar o componente.
 *
 *   const { data, loading, error, reload } = useAsyncData(() => listTasks(), [filter]);
 */
export function useAsyncData<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList = []
): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}
