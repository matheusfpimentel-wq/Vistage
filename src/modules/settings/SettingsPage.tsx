import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/lib/config";
import { closeDatabase } from "@/lib/db";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";

export function SettingsPage() {
  const { config, configPath, reset } = useConfigStore();

  async function handleReset() {
    const ok = window.confirm(
      "Isso vai desconectar o app do banco atual. Você precisará apontar o caminho do banco novamente. Continuar?"
    );
    if (!ok) return;
    await closeDatabase();
    reset();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Localização dos dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Banco de dados" value={config?.dbPath ?? "—"} />
          <Row label="Pasta de anexos" value={config?.uploadsDir ?? "—"} />
          <Row label="Arquivo de configuração" value={configPath ?? "—"} />
          <Row
            label="Criado em"
            value={
              config?.createdAt
                ? new Date(config.createdAt).toLocaleString("pt-BR")
                : "—"
            }
          />
          <div className="pt-2">
            <Button variant="outline" onClick={handleReset}>
              Trocar / reapontar banco de dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <GoogleCalendarSettings />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas fases</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Backup completo (export/import) — Fase 7.</p>
          <p>Atalhos de teclado e busca global — Fase 7.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <code className="break-all text-sm">{value}</code>
    </div>
  );
}
