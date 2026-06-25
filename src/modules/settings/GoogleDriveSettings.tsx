import { useEffect, useState } from "react";
import { Check, HardDrive, Loader2, Unplug } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { connectDrive, disconnectDrive, isDriveConnected } from "@/lib/gdrive";

/**
 * Integração com o Google Drive SÓ para mídia pesada: tira a galeria/flyers/
 * arquivos de música de dentro do .vistage (deixa o arquivo leve) e guarda no
 * Drive, baixando sob demanda. Reaproveita a conta/credenciais do Calendar.
 */
export function GoogleDriveSettings() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
      toast.success("Google Drive conectado — a mídia pesada vai pra lá automaticamente.");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao conectar o Drive: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectDrive();
    toast.success("Google Drive desconectado. A mídia que já está no Drive volta a aparecer ao reconectar; a nova passa a ser embutida.");
    await refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" /> Google Drive — mídia pesada
        </CardTitle>
        <CardDescription>
          Tira a mídia pesada de dentro do <code>.vistage</code> (deixa o arquivo leve) e
          guarda no seu Drive, baixando sob demanda em qualquer máquina. Usa a mesma conta
          do Google Calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Fica no arquivo (local):</strong> fotos de
            contatos, venues e fãs; logo, isótipo, fontes e templates.
          </p>
          <p>
            <strong className="text-foreground">Vai pro Drive:</strong> galeria da
            Identidade, presskit/manual, flyers e roteiros de GIGs, arquivos de música,
            conteúdo e festas — em subpastas por módulo dentro de <code>Vistage/</code>.
          </p>
        </div>
        {!loaded ? null : connected ? (
          <>
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <Check className="h-4 w-4" /> Conectado — mídia nova vai pro Drive automaticamente.
            </div>
            <Button variant="ghost" onClick={() => void handleDisconnect()}>
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
