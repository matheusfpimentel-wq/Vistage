import { useCallback, useEffect, useRef } from "react";
import { confirm } from "@/components/ui/confirm";

/**
 * Detecta se um diálogo tem alterações não salvas e pergunta antes de fechar,
 * usando o diálogo de confirmação no tema (não o window.confirm nativo).
 *
 * Uso:
 *   const confirmClose = useUnsavedConfirm(isDirty);
 *   <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))} />
 *
 * Enquanto o usuário decide, o diálogo permanece aberto; `andDo` só roda se
 * ele confirmar a saída (ou se não havia alterações).
 */
export function useUnsavedConfirm(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  return useCallback((next: boolean, andDo?: () => void): void => {
    // abrindo, mantendo aberto, ou sem alterações → fecha direto
    if (next || !dirtyRef.current) {
      andDo?.();
      return;
    }
    void (async () => {
      const ok = await confirm({
        title: "Alterações não salvas",
        description: "Você tem alterações não salvas. Sair mesmo assim?",
        confirmLabel: "Sair sem salvar",
        cancelLabel: "Continuar editando",
        destructive: false,
      });
      if (ok) andDo?.();
    })();
  }, []);
}
