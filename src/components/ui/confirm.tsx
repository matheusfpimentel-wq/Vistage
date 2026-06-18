import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Opener = (opts: ConfirmOptions) => Promise<boolean>;

// Singleton: o host registra a função que abre o diálogo. Assim qualquer
// módulo pode chamar `confirmDialog(...)` sem hook/contexto, substituindo o
// window.confirm que é bloqueado no webview do Tauri 2.
let opener: Opener | null = null;

/**
 * Abre um diálogo de confirmação e resolve com true/false. Aceita string
 * (vira a descrição) ou um objeto de opções. Se o host não estiver montado,
 * cai no window.confirm como último recurso.
 */
export function confirmDialog(
  opts: string | ConfirmOptions
): Promise<boolean> {
  const options = typeof opts === "string" ? { description: opts } : opts;
  if (opener) return opener(options);
  // fallback (não deve acontecer em produção)
  return Promise.resolve(window.confirm(options.description ?? "Confirmar?"));
}

/** Hook que devolve a função imperativa de confirmação. */
export function useConfirm(): Opener {
  return confirmDialog;
}

/**
 * Monta o host do diálogo de confirmação. Deve envolver a árvore do app.
 * Mantém o nome ConfirmProvider por compatibilidade.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    opener = (options) => {
      setOpts(options);
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
      });
    };
    return () => {
      opener = null;
    };
  }, []);

  function settle(value: boolean) {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && settle(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{opts.title ?? "Confirmar"}</DialogTitle>
            {opts.description && (
              <DialogDescription>{opts.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {opts.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              variant={opts.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {opts.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
