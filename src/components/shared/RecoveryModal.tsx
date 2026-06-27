import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Oferta de recuperação no boot quando a sessão anterior terminou com alterações
 * não salvas (ver lib/recovery.ts). Escolha forçada: sem X, sem fechar clicando
 * fora — Manter ou Descartar.
 */
export function RecoveryModal({
  open,
  since,
  onRecover,
  onDiscard,
}: {
  open: boolean;
  since: string | null;
  onRecover: () => void;
  onDiscard: () => void;
}) {
  const when = since
    ? new Date(since).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hideClose
        // !flex + footer fixo: numa janela pequena no boot, a descrição rola e os
        // botões de ação continuam SEMPRE visíveis (antes a janela cortava).
        // !overflow-hidden é IMPORTANTE: o DialogContent base traz overflow-y-auto
        // (grupo "overflow-y"), que o twMerge NÃO dedupe contra um "overflow-hidden"
        // comum (grupo "overflow") — sem o `!`, o container externo ainda rolava e
        // empurrava o rodapé pra fora. O `!` força overflow:hidden e só a descrição
        // interna (overflow-y-auto) rola.
        className="!flex max-h-[85vh] flex-col gap-3 !overflow-hidden sm:max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-primary" />
            Recuperar trabalho não salvo
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DialogDescription>
            A sessão anterior terminou com alterações que não chegaram a ser salvas
            num arquivo <code>.vistage</code>
            {when ? ` (${when})` : ""}. Elas continuam aqui. Manter e salvar quando
            quiser, ou descartar e abrir em branco?
          </DialogDescription>
        </div>
        <DialogFooter className="shrink-0 gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onDiscard}>
            Descartar (abrir em branco)
          </Button>
          <Button onClick={onRecover}>Manter alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
