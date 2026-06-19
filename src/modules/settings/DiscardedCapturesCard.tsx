import { useEffect, useState } from "react";
import { Archive, Loader2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  listDiscardedCaptures,
  recoverCaptures,
  useMobileChanges,
  type PendingCapture,
} from "@/lib/mobileSync";
import { summarizeCapture } from "./MobileChangesDialog";

/**
 * Backup: capturas do celular que foram DESCARTADAS no aviso de fusão. Ficam
 * aqui pra recuperação — "Recuperar" aplica de fato no arquivo. Só aparece se
 * houver algo descartado.
 */
export function DiscardedCapturesCard() {
  const [rows, setRows] = useState<PendingCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refreshPending = useMobileChanges((s) => s.refresh);

  async function load() {
    setLoading(true);
    try {
      setRows(await listDiscardedCaptures());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function recover(id: string) {
    setBusyId(id);
    try {
      await recoverCaptures([id]);
      toast.success("Recuperado e adicionado ao arquivo");
      await load();
      await refreshPending();
    } catch (e) {
      toast.error(`Erro ao recuperar: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="h-4 w-4" /> Capturas do celular descartadas
        </CardTitle>
        <CardDescription>
          Novidades que você descartou no aviso de fusão. Recupere pra adicionar ao arquivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{summarizeCapture(c)}</span>
            <Button size="sm" variant="outline" onClick={() => void recover(c.id)} disabled={busyId === c.id}>
              {busyId === c.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Recuperar
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
