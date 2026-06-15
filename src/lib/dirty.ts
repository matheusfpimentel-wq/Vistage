import { useCallback, useEffect, useRef } from "react";

/**
 * Detecta se um diálogo tem alterações não salvas e pergunta antes de fechar.
 *
 * Uso:
 *   const handle = useUnsavedConfirm(isDirty);
 *   <Dialog open={open} onOpenChange={(v) => handle(v, () => onOpenChange(v))} />
 *
 * O handler retorna `true` se pode fechar (após confirmação ou se não tinha
 * alterações). Se precisar chamar antes do setOpen, use `confirmClose()`.
 */
export function useUnsavedConfirm(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  return useCallback(
    (
      next: boolean,
      andDo?: () => void
    ): boolean => {
      // abrindo ou mantendo aberto → sempre permite
      if (next) {
        andDo?.();
        return true;
      }
      if (!dirtyRef.current) {
        andDo?.();
        return true;
      }
      const ok = window.confirm(
        "Você tem alterações não salvas. Sair mesmo assim?"
      );
      if (ok) {
        andDo?.();
        return true;
      }
      return false;
    },
    []
  );
}

/**
 * Comparação rasa entre dois objetos por chave. Útil pra calcular
 * dirty state entre snapshot inicial e state atual.
 */
export function shallowEqual<T extends Record<string, unknown>>(
  a: T,
  b: T
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}
