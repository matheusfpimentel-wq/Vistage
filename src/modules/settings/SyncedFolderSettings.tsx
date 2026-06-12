import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Cloud, FolderSync, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { useConfigStore } from "@/lib/config";
import { closeDatabase, loadDatabase } from "@/lib/db";

export function SyncedFolderSettings() {
  const { config, setSyncedFolder, relocateData } = useConfigStore();
  const [moving, setMoving] = useState(false);
  const synced = config?.syncedFolder === true;

  async function handleMove() {
    const ok = await confirmDialog(
      "Vou copiar seu banco e anexos para a pasta que você escolher (ex.: a pasta do Google Drive) e passar a trabalhar de lá.\n\n" +
        "Importante: use o Google Drive para Desktop no modo 'Espelhar arquivos' e NUNCA abra o app em duas máquinas ao mesmo tempo. Continuar?"
    );
    if (!ok) return;
    try {
      const folder = await openDialog({
        directory: true,
        multiple: false,
        title: "Escolha a pasta sincronizada (ex.: Google Drive) para guardar os dados",
      });
      if (!folder || typeof folder !== "string") return;
      setMoving(true);
      await closeDatabase();
      const cfg = await relocateData(folder, true);
      await loadDatabase(cfg.dbPath);
      toast.success("Dados movidos para a pasta sincronizada");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao mover: ${String(e)}`);
      setMoving(false);
    }
  }

  async function handleToggle() {
    try {
      await setSyncedFolder(!synced);
      toast.success(
        !synced
          ? "Modo pasta sincronizada ligado — backup automático JSON desativado"
          : "Modo pasta sincronizada desligado"
      );
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          Sincronização em nuvem (pasta sincronizada)
        </CardTitle>
        <CardDescription>
          Em vez de subir backups JSON, o próprio arquivo do banco mora dentro de
          uma pasta sincronizada (Google Drive, OneDrive, Dropbox). Assim você
          continua de onde parou em qualquer máquina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
          <p>
            <strong className="text-foreground">Como configurar com o Google Drive:</strong>
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              No Google Drive para Desktop, ative{" "}
              <strong className="text-foreground">“Espelhar arquivos”</strong>{" "}
              (não “Fazer streaming”, que corrompe o banco).
            </li>
            <li>Use o botão abaixo para mover seus dados para dentro da pasta do Drive.</li>
            <li>
              Na outra máquina, instale o Drive, espere sincronizar e use{" "}
              <strong className="text-foreground">“Abrir banco existente”</strong>{" "}
              apontando para o <code>vistage.config.json</code> dentro da pasta.
            </li>
          </ol>
          <p className="pt-1 text-amber-600 dark:text-amber-400">
            ⚠️ Nunca deixe o app aberto em duas máquinas ao mesmo tempo — espere o
            ícone do Drive ficar sincronizado antes de abrir na outra.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Status</div>
            <div className="text-xs text-muted-foreground">
              {synced
                ? "Pasta sincronizada ativa — backup automático JSON desligado."
                : "Modo padrão (backup JSON manual/automático no Drive)."}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleToggle}>
            {synced ? "Desligar modo sincronizado" : "Ligar modo sincronizado"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={handleMove} disabled={moving}>
            {moving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderSync className="h-4 w-4" />
            )}
            Mover dados para pasta sincronizada
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
