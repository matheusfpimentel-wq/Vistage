import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  previewTodoistReset,
  resetTodoistFromVistage,
  syncTodoist,
  type TodoistResetPreview,
} from "@/lib/todoist";

/**
 * Reset do projeto no Todoist a partir do Vistage.
 *
 * Apaga as tarefas ATIVAS do projeto no Todoist e repovoa com as do Vistage.
 * É destrutivo do lado do Todoist e não dá pra desfazer, então a lista do que
 * vai embora aparece INTEIRA antes de confirmar — não é um "tem certeza?" de
 * uma linha (§9 do UI_GUIDELINES: cascata diz o que vai junto).
 *
 * O que NÃO é tocado: o histórico de concluídas no Todoist. A API v1 de
 * `/tasks` devolve só as ativas, então as concluídas nem entram na lista.
 */
export function TodoistResetDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<TodoistResetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      return;
    }
    void (async () => {
      try {
        setPreview(await previewTodoistReset());
      } catch (e) {
        // A lista é lida da rede, que é justamente o que pode estar falhando.
        // Sem ela não dá pra confirmar nada às cegas.
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [open]);

  async function run() {
    setBusy(true);
    try {
      const { deleted } = await resetTodoistFromVistage();
      // O envio é a sync normal: o passo 3 dela empurra tudo que ficou sem
      // vínculo. Separado do reset pra, se a rede cair aqui, dar pra repetir
      // só a sync sem repetir as exclusões.
      const r = await syncTodoist();
      toast.success(
        `Projeto resetado: ${deleted} apagada(s) no Todoist, ${r.pushed} enviada(s) do Vistage`
      );
      await onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Reset interrompido: ${e instanceof Error ? e.message : String(e)}`, {
        duration: 15000,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resetar o projeto do Todoist a partir do Vistage</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="space-y-2 py-4">
            <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Não consegui ler o estado atual do Todoist, então não dá pra te
                mostrar o que seria apagado — e sem isso eu não executo nada.
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : preview == null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo o projeto no Todoist…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                As <strong>{preview.remoteToDelete.length}</strong> tarefas abaixo
                somem do Todoist e <strong>não voltam</strong>. Depois disso o
                Vistage envia as dele no lugar. O histórico de tarefas{" "}
                <strong>concluídas</strong> no Todoist não é tocado.
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Apagar no Todoist ({preview.remoteToDelete.length})
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                  {preview.remoteToDelete.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      O projeto já está vazio.
                    </div>
                  ) : (
                    preview.remoteToDelete.map((t) => (
                      <div key={t.id} className="truncate px-3 py-1.5 text-sm" title={t.content}>
                        {t.content}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Enviar do Vistage ({preview.localToPush.length})
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                  {preview.localToPush.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Nenhuma tarefa aberta no Vistage — o projeto ficaria vazio.
                    </div>
                  ) : (
                    preview.localToPush.map((t) => (
                      <div key={t.id} className="truncate px-3 py-1.5 text-sm" title={t.title}>
                        {t.title}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={run}
            disabled={busy || preview == null || error != null}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Resetando…
              </>
            ) : (
              <>
                <RotateCcw className="mr-1 h-4 w-4" />
                Apagar {preview?.remoteToDelete.length ?? 0} e enviar{" "}
                {preview?.localToPush.length ?? 0}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
