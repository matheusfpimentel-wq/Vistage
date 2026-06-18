import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDocumentStore } from "@/lib/document";
import { DATA_CHANGED } from "@/lib/events";

/**
 * No modelo "abre em branco", o banco é zerado a cada inicialização — então a
 * única persistência é o arquivo .vistage. Este guarda:
 *  1. marca o documento como "sujo" a cada mudança de dados;
 *  2. ao fechar a janela com mudanças não salvas, pergunta antes de sair
 *     (Salvar e sair / Sair sem salvar / Cancelar), evitando perda acidental.
 */
export function UnsavedCloseGuard() {
  const [open, setOpen] = useState(false);
  // Vira true quando o usuário confirma a saída — aí o onCloseRequested deixa
  // a janela fechar (em vez de reabrir o diálogo num loop).
  const confirmed = useRef(false);

  // Toda mudança de dados marca o documento como não salvo.
  useEffect(() => {
    const onChange = () => useDocumentStore.getState().markDirty();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, []);

  // Intercepta o fechamento da janela.
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow
      .onCloseRequested((event) => {
        if (confirmed.current) return; // saída já confirmada → deixa fechar
        if (!useDocumentStore.getState().dirty) return; // sem mudanças → fecha normal
        event.preventDefault();
        setOpen(true);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  async function closeNow() {
    confirmed.current = true;
    setOpen(false);
    await getCurrentWindow().close();
  }

  async function saveAndExit() {
    const ok = await useDocumentStore.getState().save();
    if (!ok) {
      // salvar cancelado ou falhou → não fecha
      setOpen(false);
      return;
    }
    await closeNow();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterações não salvas</DialogTitle>
          <DialogDescription>
            Há mudanças que ainda não foram salvas num arquivo .vistage. Se sair
            sem salvar, elas serão perdidas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => void closeNow()}>
            Sair sem salvar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveAndExit()}>Salvar e sair</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
