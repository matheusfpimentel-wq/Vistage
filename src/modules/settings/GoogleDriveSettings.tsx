import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
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
import { toast } from "@/components/ui/toaster";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  connect,
  disconnect,
  loadAuth,
  loadDriveConfig,
  applyFolderName,
  applySubfolderName,
  DEFAULT_FOLDER_NAME,
  saveDriveConfig,
  type DriveAuth,
  type DriveConfig,
} from "@/lib/gdrive";

export function GoogleDriveSettings() {
  const [cfg, setCfg] = useState<DriveConfig>({ clientId: "", clientSecret: "" });
  const [auth, setAuth] = useState<DriveAuth | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [folderName, setFolderName] = useState(DEFAULT_FOLDER_NAME);
  const [subfolderName, setSubfolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  async function refresh() {
    const [c, a] = await Promise.all([loadDriveConfig(), loadAuth()]);
    setCfg(c);
    setAuth(a);
    if (a) {
      setFolderName(a.folderName);
      setSubfolderName(a.subfolderName);
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

  async function handleSaveFolderName() {
    setSavingFolder(true);
    try {
      await applyFolderName(folderName);
      await applySubfolderName(subfolderName);
      setAuth((a) => a ? {
        ...a,
        folderName: folderName.trim() || DEFAULT_FOLDER_NAME,
        subfolderName: subfolderName.trim(),
      } : a);
      toast.success("Pasta atualizada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSavingFolder(false);
    }
  }

  const connected = !!auth;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Google Drive (imagens)
              {connected && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> conectado
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Armazena as imagens e anexos do app no seu Drive. Usa escopo
              restrito (drive.file) — o app só acessa os arquivos que ele mesmo
              criou.
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
          ) : null}
        </div>

        {/* Folder name */}
        {connected && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="text-sm font-medium">Pasta no Drive</div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Pasta principal (criada na raiz do Drive)</p>
              <input
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={DEFAULT_FOLDER_NAME}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Subpasta (opcional — ex: <span className="font-mono">2026</span> ou <span className="font-mono">Mac</span>)</p>
              <input
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={subfolderName}
                onChange={(e) => setSubfolderName(e.target.value)}
                placeholder="Sem subpasta"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveFolderName}
              disabled={savingFolder}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {savingFolder ? "Salvando…" : "Salvar pasta"}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
