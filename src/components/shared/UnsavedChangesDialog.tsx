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
import {
  registerUnsavedOpener,
  unregisterUnsavedOpener,
  type UnsavedChoice,
} from "@/lib/document";

/**
 * Diálogo "alterações não salvas" — aparece ao Abrir ou criar um Novo documento
 * quando o atual tem mudanças que ainda não foram gravadas no .vistage. Oferece
 * três caminhos: Salvar (grava antes de trocar), Descartar (troca perdendo as
 * mudanças) e Cancelar (não troca). Registrado de forma imperativa: o
 * document.ts chama askUnsaved() e este componente resolve a promessa.
 */
export function UnsavedChangesDialog() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: UnsavedChoice) => void) | null>(null);

  useEffect(() => {
    registerUnsavedOpener(() => {
      setOpen(true);
      return new Promise<UnsavedChoice>((resolve) => {
        resolver.current = resolve;
      });
    });
    return () => unregisterUnsavedOpener();
  }, []);

  function settle(choice: UnsavedChoice) {
    setOpen(false);
    resolver.current?.(choice);
    resolver.current = null;
  }

  // Fechar pelo X / Esc / clique fora = Cancelar (escolha mais segura).
  return (
    <Dialog open={open} onOpenChange={(o) => !o && settle("cancel")}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterações não salvas</DialogTitle>
          <DialogDescription>
            Há mudanças que ainda não foram salvas no arquivo .vistage. O que
            quer fazer antes de continuar?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <Button variant="ghost" onClick={() => settle("discard")}>
            Descartar
          </Button>
          <Button variant="outline" onClick={() => settle("cancel")}>
            Cancelar
          </Button>
          <Button onClick={() => settle("save")}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
