import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Check,
  Cloud,
  CloudUpload,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  connect,
  deleteBackupFile,
  disconnect,
  downloadAndRestoreBackup,
  listBackups,
  loadAuth,
  loadDriveConfig,
  saveDriveConfig,
  setAutoBackup,
  uploadBackup,
  type DriveAuth,
  type DriveConfig,
  type DriveFile,
} from "@/lib/gdrive";

export function GoogleDriveSettings() {
  const [cfg, setCfg] = useState<DriveConfig>({ clientId: "", clientSecret: "" });
  const [auth, setAuth] = useState<DriveAuth | null>(null);
  const [backups, setBackups] = useState<DriveFile[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DriveFile | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function refresh() {
    const [c, a] = await Promise.all([loadDriveConfig(), loadAuth()]);
    setCfg(c);
    setAuth(a);
    if (a) {
      setLoadingBackups(true);
      try {
        setBackups(await listBackups());
      } catch (e) {
        toast.error(`Erro ao listar backups: ${String(e)}`);
      } finally {
        setLoadingBackups(false);
      }
    } else {
      setBackups([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleConnect() {
    if (!cfg.clientId || !cfg.clientSecret) {
      toast.error("Preencha Client ID e Client Secret antes");
      return;
    }
    // Valida o formato do Client ID antes de abrir o fluxo OAuth. Um ID
    // malformado faz o Google rejeitar sem retornar callback, e o app ficaria
    // travado esperando até o timeout. Melhor barrar aqui.
    if (!/\.apps\.googleusercontent\.com\s*$/.test(cfg.clientId.trim())) {
      toast.error(
        "Client ID inválido. Ele deve terminar com .apps.googleusercontent.com"
      );
      return;
    }
    setConnecting(true);
    try {
      await saveDriveConfig(cfg);
      await connect();
      toast.success("Conectado ao Google Drive!");
      await refresh();
    } catch (e) {
      toast.error(`Falha na conexão: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!(await confirmDialog("Desconectar do Google Drive? Os tokens locais serão apagados."))) return;
    await disconnect();
    toast.success("Desconectado");
    await refresh();
  }

  async function handleBackupNow() {
    setBacking(true);
    try {
      const file = await uploadBackup();
      toast.success(`Backup enviado: ${file.name}`);
      await refresh();
    } catch (e) {
      toast.error(`Erro no backup: ${String(e)}`);
    } finally {
      setBacking(false);
    }
  }

  async function handleAutoBackupToggle(enabled: boolean) {
    await setAutoBackup(enabled);
    setAuth((a) => (a ? { ...a, autoBackup: enabled } : a));
    toast.success(enabled ? "Backup automático ativado" : "Backup automático desativado");
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const { restoredRows, restoredTables } = await downloadAndRestoreBackup(restoreTarget.id);
      toast.success(`Restaurado: ${restoredRows} registros em ${restoredTables} tabelas`);
      setRestoreTarget(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao restaurar: ${String(e)}`);
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete(file: DriveFile) {
    if (!(await confirmDialog({ title: "Excluir", description: `Deletar backup "${file.name}" do Drive?`, confirmLabel: "Excluir", destructive: true }))) return;
    try {
      await deleteBackupFile(file.id);
      toast.success("Backup deletado");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao deletar: ${String(e)}`);
    }
  }

  const connected = !!auth;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Google Drive Backup
                {connected && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> conectado
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Envia backups completos do banco para uma pasta "Vistage
                Backups" no seu Drive. Usa escopo restrito (drive.file) — o
                app só acessa os arquivos que ele mesmo criou.
              </CardDescription>
            </div>
            {connected && (
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                <Unplug className="h-3.5 w-3.5" /> Desconectar
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Instruções */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="font-medium text-foreground">
              Como obter Client ID e Client Secret
            </div>
            <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
              <li>Acesse o Google Cloud Console (botão abaixo)</li>
              <li>Use o mesmo projeto do Google Calendar (ou crie um novo)</li>
              <li>"APIs &amp; Services" → "Library" → ative <strong>Google Drive API</strong></li>
              <li>
                Se ainda não tiver: "OAuth consent screen" → External, adicione
                seu email como Test user
              </li>
              <li>
                "Credentials" → "Create credentials" → <strong>OAuth client ID</strong> →
                tipo <strong>Desktop app</strong>
              </li>
              <li>Copie o Client ID e o Client Secret e cole aqui</li>
            </ol>
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openExternal(
                    "https://console.cloud.google.com/apis/credentials"
                  ).catch(() => {})
                }
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir Google Cloud Console
              </Button>
            </div>
          </div>

          {/* Credenciais */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input
                value={cfg.clientId}
                onChange={(e) => setCfg((c) => ({ ...c, clientId: e.target.value }))}
                placeholder="000000000000-xxxx.apps.googleusercontent.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <Input
                type="password"
                value={cfg.clientSecret}
                onChange={(e) => setCfg((c) => ({ ...c, clientSecret: e.target.value }))}
                placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
              />
            </div>
          </div>

          {/* Botões principais */}
          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => saveDriveConfig(cfg).then(() => toast.success("Credenciais salvas"))}
                >
                  Salvar credenciais
                </Button>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Conectar Google Drive
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleBackupNow} disabled={backing}>
                  {backing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4" />
                  )}
                  Fazer backup agora
                </Button>
                <Button
                  variant="outline"
                  onClick={() => refresh().then(() => toast.success("Lista atualizada"))}
                >
                  <RefreshCw className="h-4 w-4" /> Atualizar lista
                </Button>
              </>
            )}
          </div>

          {/* Auto-backup toggle */}
          {connected && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">
                <div className="font-medium">Backup automático</div>
                <div className="text-xs text-muted-foreground">
                  Sobe ao abrir o app e após mudanças (no máx. 1x a cada 10 min).
                  Ao abrir, sugere restaurar se houver backup mais novo no Drive.
                  <br />
                  Último backup:{" "}
                  {auth?.lastBackupAt
                    ? new Date(auth.lastBackupAt).toLocaleString("pt-BR")
                    : "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAutoBackupToggle(!(auth?.autoBackup ?? false))}
                className={[
                  "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                  auth?.autoBackup
                    ? "bg-primary"
                    : "bg-input",
                ].join(" ")}
              >
                <span
                  className={[
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    auth?.autoBackup ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                >
                  {auth?.autoBackup && (
                    <Check className="h-3 w-3 m-1 text-primary" />
                  )}
                </span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de backups */}
      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backups no Drive</CardTitle>
            <CardDescription>
              Pasta "Vistage Backups" no seu Google Drive. Restaurar é
              destrutivo — substitui todos os dados atuais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBackups ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum backup encontrado. Clique em "Fazer backup agora" para criar o primeiro.
              </p>
            ) : (
              <div className="space-y-2">
                {backups.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {file.created_time
                          ? new Date(file.created_time).toLocaleString("pt-BR")
                          : "—"}
                        {file.size
                          ? ` · ${(parseInt(file.size) / 1024).toFixed(1)} KB`
                          : ""}
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRestoreTarget(file)}
                      >
                        Restaurar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(file)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmação de restauração */}
      <Dialog
        open={!!restoreTarget}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar backup do Drive?</DialogTitle>
            <DialogDescription>
              Isso vai <strong>substituir todos os dados atuais</strong> pelos
              dados do arquivo abaixo. Esta ação não pode ser desfeita.
              <br />
              <br />
              <code className="rounded bg-muted px-1 text-xs">
                {restoreTarget?.name}
              </code>
              <br />
              <span className="text-xs">
                {restoreTarget?.created_time
                  ? new Date(restoreTarget.created_time).toLocaleString("pt-BR")
                  : ""}
              </span>
              <br />
              <br />
              Recomendamos fazer um backup local antes de restaurar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Sim, restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
