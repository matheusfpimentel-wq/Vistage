import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/format";
import {
  acceptDriftFromGoogle,
  keepMineOverGoogle,
  type CalendarDrift,
} from "@/lib/gcal";

/**
 * Revisão de divergências: eventos que foram editados NO GOOGLE depois do
 * último push do app. Para cada um, o usuário escolhe aceitar a mudança do
 * Google (atualiza a GIG) ou manter a sua versão (reescreve no Google).
 * Nada é aplicado sem a escolha — o detector em si é só leitura.
 */
export function CalendarDriftDialog({
  open,
  onOpenChange,
  drifts,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  drifts: CalendarDrift[];
  /** Chamado após resolver tudo (pra atualizar a tela de origem). */
  onResolved: () => void;
}) {
  // Ids já resolvidos nesta sessão do diálogo (somem da lista).
  const [done, setDone] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  const pending = drifts.filter((d) => !done.has(d.gigId));

  async function resolve(d: CalendarDrift, accept: boolean) {
    setBusyId(d.gigId);
    try {
      if (accept) await acceptDriftFromGoogle(d);
      else await keepMineOverGoogle(d.gigId);
      const next = new Set(done);
      next.add(d.gigId);
      setDone(next);
      toast.success(
        accept ? "Mudança do Google aplicada na GIG." : "Sua versão mantida no Google."
      );
      if (next.size >= drifts.length) {
        onResolved();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(`Não foi possível resolver: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  function fmt(date: string | null, time: string | null): string {
    const d = date ? formatDate(date) : "—";
    return time ? `${d} · ${time}` : d;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onResolved();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mudanças feitas no Google</DialogTitle>
          <DialogDescription>
            Estes eventos foram editados direto no Google Calendar depois do último
            envio. Escolha o que vale para cada um.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {pending.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Tudo resolvido.
            </p>
          ) : (
            pending.map((d) => (
              <div key={d.gigId} className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-medium">{d.gigName}</div>
                <div className="mb-3 flex items-center gap-2 text-xs">
                  <div className="rounded border bg-muted/40 px-2 py-1">
                    <div className="text-[10px] uppercase text-muted-foreground">No app</div>
                    <div className="tabular-nums">{fmt(d.appDate, d.appStartTime)}</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="rounded border border-primary/40 bg-primary/5 px-2 py-1">
                    <div className="text-[10px] uppercase text-muted-foreground">No Google</div>
                    <div className="tabular-nums">{fmt(d.googleDate, d.googleStartTime)}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void resolve(d, true)}
                    disabled={busyId === d.gigId}
                  >
                    {busyId === d.gigId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Aceitar do Google
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void resolve(d, false)}
                    disabled={busyId === d.gigId}
                  >
                    Manter a minha
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
