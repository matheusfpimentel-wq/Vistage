import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  type OpenMode,
  registerOpenModeOpener,
  unregisterOpenModeOpener,
} from "@/lib/document";

/**
 * Diálogo de escolha de modo ao abrir um documento .vistage.
 * Deve ser montado uma vez na árvore do app (em RoutedApp).
 * Exibe as opções Mesclar / Sobrescrever / Cancelar.
 */
export function OpenDocumentDialog() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((mode: OpenMode) => void) | null>(null);

  useEffect(() => {
    registerOpenModeOpener(() => {
      setOpen(true);
      return new Promise<OpenMode>((resolve) => {
        resolver.current = resolve;
      });
    });
    return () => {
      unregisterOpenModeOpener();
    };
  }, []);

  function settle(mode: OpenMode) {
    setOpen(false);
    resolver.current?.(mode);
    resolver.current = null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) settle("cancel");
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir documento</DialogTitle>
          <DialogDescription>
            Como você quer abrir este documento?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={() => settle("merge")}
          >
            <span className="font-semibold mr-2">Mesclar</span>
            <span className="text-xs text-muted-foreground">
              Adiciona apenas registros novos, preserva os existentes
            </span>
          </Button>
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={() => settle("overwrite")}
          >
            <span className="font-semibold mr-2">Sobrescrever</span>
            <span className="text-xs text-muted-foreground">
              Substitui todos os dados atuais pelo documento
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => settle("cancel")}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
