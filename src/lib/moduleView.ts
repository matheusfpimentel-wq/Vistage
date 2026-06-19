import { useCallback, useState } from "react";
import { persistDocSetting } from "./docSettings";

/**
 * View persistente por módulo: lembra a escolha do usuário (lista/cards/etc.)
 * entre aberturas. Grava no cache local (síncrono) e no document_settings, então
 * a escolha viaja com o .vistage. `key` identifica o módulo.
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
      persistDocSetting(storageKey, v);
      setValue(v);
    },
    [storageKey]
  );
  return [value, set];
}
