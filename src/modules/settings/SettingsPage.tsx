import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { Download, Loader2, Plug, RefreshCw, RotateCcw, Sparkles, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmDialog } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useConfigStore } from "@/lib/config";
import { closeDatabase, initDatabase } from "@/lib/db";
import { DEFAULT_TURSO_TOKEN, DEFAULT_TURSO_URL } from "@/lib/turso-defaults";
import {
  exportBackupToFile,
  pickBackupFile,
  restoreBackup,
} from "@/lib/backup";
import { isDatabaseEmpty, seedExampleData } from "@/lib/seed";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { GoogleDriveSettings } from "./GoogleDriveSettings";
import { SyncedFolderSettings } from "./SyncedFolderSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { CsvImportExport } from "./CsvImportExport";
import { MenuOrderSettings } from "./MenuOrderSettings";
import { TodoistSettings } from "./TodoistSettings";
import { DbDiagnostics } from "./DbDiagnostics";

export function SettingsPage() {
  const { config, configPath, reset, patchConfig } = useConfigStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [canSeed, setCanSeed] = useState(false);
  const [remigrating, setRemigrating] = useState(false);
  const [remigrateResult, setRemigrateResult] = useState<[string, number][] | null>(null);
  const [resettingReplica, setResettingReplica] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    void isDatabaseEmpty().then(setCanSeed);
  }, []);

  async function handleReset() {
    const ok = await confirmDialog(
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
      !(await confirmDialog(
        "Carregar dados de exemplo? 5 contatos, 4 GIGs em estados diferentes, 6 tarefas e algumas transações vão ser adicionados ao banco."
      ))
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
      const ok = await confirmDialog(
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
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao importar: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleReconnect() {
    setReconnecting(true);
    try {
      const dataDir = await appDataDir();
      const sep = dataDir.includes("\\") && !dataDir.includes("/") ? "\\" : "/";
      const replicaPath = `${dataDir.replace(/[\\/]+$/, "")}${sep}vistage-replica.db`;
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      await initDatabase(replicaPath, tursoUrl, tursoToken);
      toast.success("Banco reconectado. Recarregando…");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao reconectar: ${String(e)}`);
    } finally {
      setReconnecting(false);
    }
  }

  async function handleResetReplica() {
    const ok = await confirmDialog({
      title: "Importar tudo do Turso",
      description:
        "Copia todos os dados do Turso para o banco local via conexão HTTP direta. " +
        "Use isso quando os dados estão na nuvem mas não aparecem no app. " +
        "O app vai recarregar ao terminar.",
      confirmLabel: "Importar tudo",
    });
    if (!ok) return;
    setResettingReplica(true);
    try {
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      const result = await invoke<[string, number][]>("db_pull_from_turso", {
        tursoUrl,
        tursoToken,
      });
      const total = result.reduce((s, [, n]) => s + n, 0);
      toast.success(`${total} registros importados do Turso. Recarregando…`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao importar: ${String(e)}`);
    } finally {
      setResettingReplica(false);
    }
  }

  async function handleRemigrate() {
    if (!config?.dbPath) {
      toast.error("Nenhum arquivo .db legado configurado.");
      return;
    }
    const ok = await confirmDialog({
      title: "Reimportar dados do banco local",
      description:
        `Vai copiar todos os dados do arquivo local (${config.dbPath}) para o Turso novamente. ` +
        "Dados já existentes no Turso não são apagados antes — registros duplicados são ignorados (INSERT OR IGNORE). " +
        "Isso é seguro e não-destrutivo.",
      confirmLabel: "Reimportar",
    });
    if (!ok) return;
    setRemigrating(true);
    setRemigrateResult(null);
    try {
      const result = await invoke<[string, number][]>("db_migrate_from_sqlite", {
        sqlitePath: config.dbPath,
      });
      await patchConfig({ migrated: true });
      setRemigrateResult(result);
      toast.success("Dados reimportados com sucesso! Recarregando…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(`Erro ao reimportar: ${String(e)}`);
    } finally {
      setRemigrating(false);
    }
  }

  return (
    <Tabs defaultValue="integracoes" className="space-y-4">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        <TabsTrigger value="personalizacao">Personalização</TabsTrigger>
        <TabsTrigger value="atalhos">Atalhos</TabsTrigger>
        <TabsTrigger value="backup">Backup</TabsTrigger>
      </TabsList>

      {/* ─── Integrações ─────────────────────────────────────── */}
      <TabsContent value="integracoes" className="space-y-6">
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plug className="h-4 w-4 text-amber-500" />
              Reconectar banco
            </CardTitle>
            <CardDescription>
              Se o app mostra "banco não inicializado" mas o arquivo de réplica
              já existe, use isso para reabrir a conexão sem apagar nenhum dado.
              Mais rápido e seguro do que "Baixar tudo da nuvem".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleReconnect}
              disabled={reconnecting}
            >
              {reconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              {reconnecting ? "Reconectando…" : "Reconectar banco"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-destructive" />
              Nuvem (Turso) — baixar tudo do zero
            </CardTitle>
            <CardDescription>
              Se os dados estão no Turso mas não aparecem no app, apague a
              réplica local e force o download completo da nuvem. O app
              recarrega ao terminar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={handleResetReplica}
              disabled={resettingReplica}
            >
              {resettingReplica ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {resettingReplica ? "Baixando…" : "Baixar tudo da nuvem"}
            </Button>
          </CardContent>
        </Card>

        <DbDiagnostics />

        <TodoistSettings />
        <GoogleCalendarSettings />
        <GoogleDriveSettings />
        <SyncedFolderSettings />
      </TabsContent>

      {/* ─── Personalização ──────────────────────────────────── */}
      <TabsContent value="personalizacao" className="space-y-6">
        <MenuOrderSettings />

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

        {config?.dbPath && (
          <Card className="border-amber-500/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-500" />
                Reimportar dados do banco local
              </CardTitle>
              <CardDescription>
                Se seus dados sumiram após a migração para o Turso (ex.: clicou
                "Pular" na tela de migração, ou os dados nunca chegaram à nuvem),
                use isso para copiar o arquivo <code>.db</code> local de volta para
                o Turso. Não apaga nada — registros já existentes são preservados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground break-all">
                Arquivo: <code>{config.dbPath}</code>
              </p>
              <Button
                variant="outline"
                onClick={handleRemigrate}
                disabled={remigrating}
                className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                {remigrating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {remigrating ? "Reimportando…" : "Reimportar agora"}
              </Button>
              {remigrateResult && (
                <div className="text-xs font-mono space-y-0.5 text-muted-foreground max-h-32 overflow-y-auto">
                  {remigrateResult.map(([table, count]) => (
                    <div key={table} className="flex justify-between gap-4">
                      <span>{table}</span>
                      <span className="text-foreground">{count} linhas</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
      </TabsContent>

      {/* ─── Atalhos ──────────────────────────────────────────── */}
      <TabsContent value="atalhos" className="space-y-6">
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
      </TabsContent>

      {/* ─── Backup ───────────────────────────────────────────── */}
      <TabsContent value="backup" className="space-y-6">
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

        <CsvImportExport />
      </TabsContent>
    </Tabs>
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
