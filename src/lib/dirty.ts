import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { confirmDialog } from "@/components/ui/confirm";

/**
 * Detecta se um diálogo tem alterações não salvas e pergunta antes de fechar.
 *
 * Uso:
 *   const handle = useUnsavedConfirm(isDirty);
 *   <Dialog open={open} onOpenChange={(v) => handle(v, () => onOpenChange(v))} />
 *
 * Como o `open` do diálogo é controlado pelo pai, basta NÃO propagar o
 * fechamento (`andDo`) enquanto a confirmação está pendente — o diálogo
 * continua aberto. Isso cobre clique-fora, Esc e o X, que no Radix passam
 * todos por `onOpenChange(false)`. Usa o `confirmDialog` (Radix) porque o
 * `window.confirm` é bloqueado no webview do Tauri 2 e fechava perdendo dados.
 */
export function useUnsavedConfirm(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  return useCallback((next: boolean, andDo?: () => void): void => {
    // abrindo ou mantendo aberto → sempre permite
    if (next) {
      andDo?.();
      return;
    }
    if (!dirtyRef.current) {
      andDo?.();
      return;
    }
    void confirmDialog({
      title: "Descartar alterações?",
      description: "Você tem alterações não salvas. Sair mesmo assim?",
      confirmLabel: "Descartar",
      cancelLabel: "Continuar editando",
      destructive: true,
    }).then((ok) => {
      if (ok) andDo?.();
    });
  }, []);
}

/**
 * Bloqueia a navegação do React Router enquanto há alterações não salvas.
 * Usa `useBlocker` do react-router-dom. Mostra o `confirmDialog` antes de prosseguir.
 */
export function useNavigationGuard(isDirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirmDialog({
      title: "Descartar alterações?",
      description: "Você tem alterações não salvas. Sair mesmo assim?",
      confirmLabel: "Descartar",
      cancelLabel: "Continuar editando",
      destructive: true,
    }).then((ok) => {
      if (ok) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker]);
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
