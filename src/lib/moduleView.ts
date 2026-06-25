import { useCallback, useState } from "react";

/**
 * View persistente por módulo: lembra a escolha do usuário (lista/cards/etc.)
 * entre aberturas. É uma preferência da MÁQUINA — fica no localStorage do
 * aparelho, NÃO viaja com o .vistage e NÃO depende de salvar o documento. Assim
 * "o jeito que deixei a tela" persiste mesmo em outra sessão, abrindo o mesmo
 * arquivo ou não. (Antes ia pro document_settings e o abrir-arquivo, que recarrega
 * o app, sobrescrevia a escolha local com a que estava salva no arquivo.)
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
        /* storage cheio/indisponível */
      }
      setValue(v);
    },
    [storageKey]
  );
  return [value, set];
}
