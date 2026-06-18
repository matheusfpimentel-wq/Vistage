import { useCallback, useState } from "react";

/**
 * View persistente por módulo: lembra a escolha do usuário (lista/cards/etc.)
 * entre aberturas, via localStorage. `key` identifica o módulo.
 */
export function useModuleView<T extends string>(
  key: string,
  initial: T
): [T, (v: T) => void] {
  const storageKey = `vistage.view.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(storageKey) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(storageKey, v);
      } catch {
        /* ignore */
      }
      setValue(v);
    },
    [storageKey]
  );
  return [value, set];
}
