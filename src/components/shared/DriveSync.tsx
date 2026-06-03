import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED } from "@/lib/events";
import {
  downloadAndRestoreBackup,
  findNewerDriveBackup,
  maybeAutoBackupAfterChange,
  runAutoBackupIfEnabled,
  type DriveFile,
} from "@/lib/gdrive";

/**
 * Coordena a sincronização com o Google Drive sem UI fixa:
 * - No boot, sugere restaurar se houver backup mais novo feito em outra máquina.
 * - No boot, sobe o backup automático (se ligado nas configurações).
 * - Após mudanças de dados, sobe backup com throttle (se ligado).
 *
 * Não renderiza nada além do diálogo de sugestão quando aplicável.
 */
export function DriveSync() {
  const [suggested, setSuggested] = useState<DriveFile | null>(null);
  const [restoring, setRestoring] = useState(false);
  const ranBoot = useRef(false);

  // Boot: sugestão de restore + backup automático de abertura
  useEffect(() => {
    if (ranBoot.current) return;
    ranBoot.current = true;
    void (async () => {
      try {
        const newer = await findNewerDriveBackup();
        if (newer) {
          setSuggested(newer);
          return; // espera decisão do usuário antes de subir um novo backup
        }
        await runAutoBackupIfEnabled();
      } catch {
        // silencioso: Drive desconectado ou offline não deve travar o app
      }
    })();
  }, []);

  // Backup automático com throttle após mudanças de dados
  useEffect(() => {
    const onChange = () => {
      void maybeAutoBackupAfterChange().catch(() => {});
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, []);

  async function handleRestore() {
    if (!suggested) return;
    setRestoring(true);
    try {
      const { restoredRows, restoredTables } = await downloadAndRestoreBackup(suggested.id);
      toast.success(`Restaurado: ${restoredRows} registros em ${restoredTables} tabelas`);
      setSuggested(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao restaurar: ${String(e)}`);
      setRestoring(false);
    }
  }

  function handleSkip() {
    setSuggested(null);
    // o usuário optou por manter os dados locais; sobe backup se estiver ligado
    void runAutoBackupIfEnabled().catch(() => {});
  }

  return (
    <Dialog open={!!suggested} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Backup mais novo no Drive</DialogTitle>
          <DialogDescription>
            Encontrei um backup no Google Drive mais recente que seus dados
            locais. Talvez tenha sido feito em outro dispositivo.
            <br />
            <br />
            <code className="rounded bg-muted px-1 text-xs">
              {suggested?.name}
            </code>
            <br />
            <span className="text-xs">
              {suggested?.created_time
                ? new Date(suggested.created_time).toLocaleString("pt-BR")
                : ""}
            </span>
            <br />
            <br />
            Restaurar vai <strong>substituir os dados atuais</strong> pelos do
            backup. Se preferir manter o que está aqui, escolha continuar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleSkip} disabled={restoring}>
            Manter dados locais
          </Button>
          <Button onClick={handleRestore} disabled={restoring}>
            {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Restaurar do Drive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
