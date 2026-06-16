import { useCallback, useEffect, useRef } from "react";
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
