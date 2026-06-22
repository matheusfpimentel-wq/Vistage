import { useEffect, useRef, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import {
  discardCaptures,
  ingestCaptures,
  useMobileChanges,
  type PendingCapture,
} from "@/lib/mobileSync";

const KIND_LABEL: Record<string, string> = {
  session: "Sessão de foco",
  highlight: "Destaque",
  note: "Nota",
  task: "Tarefa",
  task_done: "Tarefa concluída",
  contact: "Pessoa",
  gig: "GIG",
};

export function summarizeCapture(c: PendingCapture): string {
  const p = c.payload ?? {};
  const t = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  const label = KIND_LABEL[c.kind] ?? c.kind;
  const detail = t("title") ?? t("body") ?? t("text") ?? t("name") ?? t("venue_name") ?? t("activity_type") ?? "";
  return detail ? `${label}: ${detail}` : label;
}

/**
 * Aviso "abriu o desktop e tem novidade do celular": deixa FUNDIR tudo (aplica
 * no arquivo) ou DESCARTAR (recuperável em Configurações → Backup). O celular só
 * adiciona; nunca exclui — então aqui é sempre adição.
 */
export function MobileChangesDialog() {
  const pending = useMobileChanges((s) => s.pending);
  const refresh = useMobileChanges((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevLen = useRef(0);

  // Reabre quando chegam novas capturas (mesmo que tenha fechado com "Depois").
  useEffect(() => {
    if (pending.length > prevLen.current) setDismissed(false);
    prevLen.current = pending.length;
  }, [pending.length]);

  const open = pending.length > 0 && !dismissed;
  const ids = pending.map((c) => c.id);

  async function fundir() {
    setBusy(true);
    try {
      const n = await ingestCaptures(ids);
      toast.success(n > 0 ? `${n} novidade(s) do celular adicionada(s)` : "Nada para adicionar");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao adicionar: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function descartar() {
    const ok = await confirmDialog({
      title: "Descartar novidades do celular",
      description:
        "Elas não serão adicionadas agora. Dá pra recuperar depois em Configurações → Backup. Descartar?",
      confirmLabel: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await discardCaptures(ids);
      toast.success("Descartado — recuperável no Backup");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao descartar: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setDismissed(true)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Novidades do celular
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Você adicionou {pending.length} {pending.length === 1 ? "coisa" : "coisas"} no
          celular. Quer adicionar ao seu arquivo agora?
        </p>

        <ul className="max-h-60 space-y-1.5 overflow-y-auto">
          {pending.map((c) => (
            <li key={c.id} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {summarizeCapture(c)}
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDismissed(true)} disabled={busy}>
            Depois
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void descartar()} disabled={busy}>
              Descartar
            </Button>
            <Button onClick={() => void fundir()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Fundir tudo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
