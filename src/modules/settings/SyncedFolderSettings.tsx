import { Cloud } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SyncedFolderSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          Sincronização em nuvem
        </CardTitle>
        <CardDescription>
          O Vistage agora usa o Turso para armazenar seus dados diretamente na nuvem,
          com uma réplica local para leitura offline. Não é mais necessário mover
          arquivos para o Google Drive manualmente — a sincronização é automática e
          segura, sem risco de corrupção por conflito de arquivos.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>
          Seus dados estão sendo salvos no Turso (
          <code className="text-xs">mazik-dj-matheusfpimentel-wq.aws-us-east-2.turso.io</code>
          ) em tempo real. As imagens continuam sincronizando com o Google Drive como antes.
        </p>
      </CardContent>
    </Card>
  );
}
