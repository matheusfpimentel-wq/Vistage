import { useEffect, useState } from "react";
import { Check, HardDrive, Loader2, Unplug } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import {
  connectDrive,
  disconnectDrive,
  isDriveConnected,
  isDriveSyncMedia,
  isDriveSyncDocs,
  setDriveSyncMedia,
  setDriveSyncDocs,
} from "@/lib/gdrive";

/**
 * Integração com o Google Drive SÓ para mídia pesada: tira a galeria/flyers/
 * arquivos de música de dentro do .vistage (deixa o arquivo leve) e guarda no
 * Drive, baixando sob demanda. Reaproveita a conta/credenciais do Calendar.
 */
export function GoogleDriveSettings() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncMedia, setSyncMediaState] = useState(isDriveSyncMedia());
  const [syncDocs, setSyncDocsState] = useState(isDriveSyncDocs());

  async function refresh() {
    setConnected(await isDriveConnected().catch(() => false));
    setLoaded(true);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      await connectDrive();
      toast.success("Google Drive conectado — a mídia nova vai pra lá automaticamente.");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao conectar o Drive: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectDrive();
    toast.success("Google Drive desconectado. A mídia nova passa a ser embutida no arquivo.");
    await refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" /> Google Drive
          <InfoHint>
            Tira a mídia pesada de dentro do .vistage (deixa o arquivo leve) e
            guarda no seu Drive, baixando sob demanda em qualquer máquina. Usa a
            mesma conta do Google Calendar. Fotos de contatos/venues/fãs, logo,
            isótipo, fontes e templates ficam sempre locais.
          </InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded ? null : connected ? (
          <>
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <Check className="h-4 w-4" /> Conectado
            </div>

            {/* O que sincronizar — sync automático ao subir o arquivo. */}
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium">O que mandar pro Drive automaticamente</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={syncMedia}
                  onChange={(e) => {
                    setSyncMediaState(e.target.checked);
                    setDriveSyncMedia(e.target.checked);
                  }}
                />
                Imagens e vídeos
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={syncDocs}
                  onChange={(e) => {
                    setSyncDocsState(e.target.checked);
                    setDriveSyncDocs(e.target.checked);
                  }}
                />
                Documentos
              </label>
              <p className="text-[11px] text-muted-foreground">
                Vale pra mídia nova. O que já está no Drive continua lá.
              </p>
            </div>

            <Button variant="outline" onClick={() => void handleDisconnect()}>
              <Unplug className="h-4 w-4" /> Desconectar
            </Button>
          </>
        ) : (
          <Button onClick={() => void handleConnect()} disabled={connecting}>
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Conectar o Google Drive
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">
          Precisa do Client ID/Secret do Google já preenchidos na seção do Calendar (mesma conta).
        </p>
      </CardContent>
    </Card>
  );
}
