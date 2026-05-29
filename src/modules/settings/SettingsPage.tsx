import { useEffect, useState } from "react";
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useConfigStore } from "@/lib/config";
import { closeDatabase } from "@/lib/db";
import {
  exportBackupToFile,
  pickBackupFile,
  restoreBackup,
} from "@/lib/backup";
import { isDatabaseEmpty, seedExampleData } from "@/lib/seed";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { ShortcutSettings } from "./ShortcutSettings";

export function SettingsPage() {
  const { config, configPath, reset } = useConfigStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [canSeed, setCanSeed] = useState(false);

  useEffect(() => {
    void isDatabaseEmpty().then(setCanSeed);
  }, []);

  async function handleReset() {
    const ok = window.confirm(
      "Isso vai desconectar o app do banco atual. Você precisará apontar o caminho do banco novamente. Continuar?"
    );
    if (!ok) return;
    await closeDatabase();
    reset();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const path = await exportBackupToFile();
      if (path) toast.success(`Backup salvo em ${path}`);
    } catch (e) {
      toast.error(`Erro ao exportar: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleSeed() {
    if (
      !window.confirm(
        "Carregar dados de exemplo? 5 contatos, 4 GIGs em estados diferentes, 6 tarefas e algumas transações vão ser adicionados ao banco."
      )
    )
      return;
    setSeeding(true);
    try {
      const result = await seedExampleData();
      toast.success(
        `${result.gigs} GIGs, ${result.contacts} contatos, ${result.tasks} tarefas e ${result.transactions} transações criadas.`
      );
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao popular: ${String(e)}`);
    } finally {
      setSeeding(false);
    }
  }

  async function handleImport() {
    try {
      const backup = await pickBackupFile();
      if (!backup) return;
      const ok = window.confirm(
        `ATENÇÃO: importar este backup vai SUBSTITUIR TODOS os dados do banco atual.\n\n` +
          `Backup gerado em: ${new Date(backup.exportedAt).toLocaleString("pt-BR")}\n` +
          `Versão: ${backup.version}\n\n` +
          `Recomendamos exportar o estado atual antes. Continuar?`
      );
      if (!ok) return;
      setImporting(true);
      const { restoredRows, restoredTables } = await restoreBackup(backup);
      toast.success(
        `Restaurado: ${restoredRows} registros em ${restoredTables} tabelas`
      );
      // recarrega a aplicação para refletir o novo estado
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao importar: ${String(e)}`);
    } finally {
      setImporting(false);
    }
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

      {canSeed && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Carregar dados de exemplo
            </CardTitle>
            <CardDescription>
              Seu banco está vazio. Quer popular com 4 GIGs (uma futura,
              uma a caminho, uma concluída com debrief, uma com debrief
              pendente), 5 contatos, 6 tarefas e algumas transações pra
              você explorar como o sistema funciona?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSeed} disabled={seeding}>
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Popular com exemplos
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup completo</CardTitle>
          <CardDescription>
            Exporta um arquivo JSON com tudo do seu banco (GIGs, contatos,
            tarefas, financeiro, configurações). Importar é destrutivo —
            substitui o estado atual pelo backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar backup
            </Button>
            <Button
              variant="outline"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importar backup
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anexos (arquivos em <code>uploads/</code>) não entram neste JSON.
            Para backup completo dos anexos, copie a pasta inteira do HD.
          </p>
        </CardContent>
      </Card>

      <ShortcutSettings />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outras teclas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Shortcut keys={["Ctrl/Cmd", "Enter"]} label="Salvar (dentro de modais)" />
          <Shortcut keys={["Esc"]} label="Fecha modais e diálogos" />
        </CardContent>
      </Card>
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground">+</span>}
            <kbd className="inline-block rounded border bg-muted px-1.5 py-0.5 text-xs">
              {k}
            </kbd>
          </span>
        ))}
      </div>
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
