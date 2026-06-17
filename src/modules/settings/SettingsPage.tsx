import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CloudDownload,
  CloudUpload,
  FolderOpen,
  Loader2,
  RotateCcw,
  Save,
  SaveAll,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmDialog } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useConfigStore } from "@/lib/config";
import { closeDatabase, pushToTurso } from "@/lib/db";
import { useDocumentStore } from "@/lib/document";
import { DEFAULT_TURSO_TOKEN, DEFAULT_TURSO_URL } from "@/lib/turso-defaults";
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
  const [seeding, setSeeding] = useState(false);
  const [canSeed, setCanSeed] = useState(false);
  const [remigrating, setRemigrating] = useState(false);
  const [remigrateResult, setRemigrateResult] = useState<[string, number][] | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  const autoCloud = config?.autoCloudSave !== false; // default ligado
  const doc = useDocumentStore();

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

  async function handleToggleAutoCloud() {
    await patchConfig({ autoCloudSave: !autoCloud });
    toast.success(
      !autoCloud
        ? "Salvamento em nuvem automático ligado."
        : "Salvamento em nuvem automático desligado. Use 'Salvar manualmente' para enviar."
    );
  }

  // Carregar base de dados: traz tudo do Turso para a máquina (HTTP direto).
  async function handlePull() {
    const ok = await confirmDialog({
      title: "Carregar base de dados da nuvem",
      description:
        "Substitui os dados desta máquina pelos que estão salvos na nuvem (Turso). " +
        "Use quando os dados estão na nuvem mas não aparecem aqui. O app recarrega ao terminar.",
      confirmLabel: "Carregar",
    });
    if (!ok) return;
    setPulling(true);
    try {
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      const result = await invoke<[string, number][]>("db_pull_from_turso", {
        tursoUrl,
        tursoToken,
      });
      const total = result.reduce((s, [, n]) => s + n, 0);
      toast.success(`${total} registros carregados da nuvem. Recarregando…`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`Erro ao carregar: ${String(e)}`);
    } finally {
      setPulling(false);
    }
  }

  // Salvar manualmente: envia tudo desta máquina para o Turso (HTTP direto).
  async function handlePush() {
    setPushing(true);
    try {
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      await pushToTurso(tursoUrl, tursoToken);
      toast.success("Dados salvos na nuvem.");
    } catch (e) {
      toast.error(`Erro ao salvar na nuvem: ${String(e)}`);
    } finally {
      setPushing(false);
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
    <Tabs defaultValue="salvamento" className="space-y-4">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="salvamento">Salvamento</TabsTrigger>
        <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        <TabsTrigger value="personalizacao">Personalização</TabsTrigger>
        <TabsTrigger value="atalhos">Atalhos</TabsTrigger>
      </TabsList>

      {/* ─── Salvamento ──────────────────────────────────────── */}
      <TabsContent value="salvamento" className="space-y-6">
        {/* Nuvem */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salvamento em nuvem (Turso)</CardTitle>
            <CardDescription>
              Seus dados ficam salvos na nuvem e sincronizados entre seus
              computadores. Com o automático ligado, cada mudança é enviada
              sozinha após um minuto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle
              checked={autoCloud}
              onChange={handleToggleAutoCloud}
              label="Salvamento em nuvem automático"
              hint={autoCloud ? "Ligado — enviando mudanças sozinho" : "Desligado — salve manualmente"}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" onClick={handlePull} disabled={pulling}>
                {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                {pulling ? "Carregando…" : "Carregar base de dados"}
              </Button>
              <Button variant="outline" onClick={handlePush} disabled={pushing}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                {pushing ? "Salvando…" : "Salvar manualmente"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Carregar</strong> traz tudo da nuvem para esta máquina
              (substitui o local). <strong>Salvar manualmente</strong> envia o
              que está aqui para a nuvem.
            </p>
          </CardContent>
        </Card>

        {/* Documento local (.vistage) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documento (.vistage)</CardTitle>
            <CardDescription>
              Um arquivo único com TODOS os dados, imagens e arquivos (roteiros,
              manual de marca, etc.) — como um documento do Office. Independe da
              nuvem: pode abrir, salvar e mandar para outra pessoa.
              {doc.currentName && (
                <> Atual: <code>{doc.currentName}</code>.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void doc.open()} disabled={doc.busy}>
                <FolderOpen className="h-4 w-4" />
                Abrir…
              </Button>
              <Button variant="outline" onClick={() => void doc.save()} disabled={doc.busy}>
                <Save className="h-4 w-4" />
                Salvar
              </Button>
              <Button variant="outline" onClick={() => void doc.saveAs()} disabled={doc.busy}>
                <SaveAll className="h-4 w-4" />
                Salvar como…
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Abrir um documento substitui todos os dados atuais. Atalho:{" "}
              <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">Ctrl S</kbd> salva.
            </p>
          </CardContent>
        </Card>

        {/* Diagnóstico */}
        <DbDiagnostics />

        {/* Importação/Exportação CSV */}
        <CsvImportExport />
      </TabsContent>

      {/* ─── Integrações ─────────────────────────────────────── */}
      <TabsContent value="integracoes" className="space-y-6">
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
                Se seus dados sumiram após a migração para o Turso, use isso para
                copiar o arquivo <code>.db</code> local de volta para a nuvem. Não
                apaga nada — registros já existentes são preservados.
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
                Seu banco está vazio. Quer popular com 4 GIGs, 5 contatos, 6
                tarefas e algumas transações pra você explorar como o sistema
                funciona?
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
            <Shortcut keys={["Ctrl/Cmd", "S"]} label="Salvar documento (.vistage)" />
            <Shortcut keys={["Ctrl/Cmd", "Enter"]} label="Salvar (dentro de modais)" />
            <Shortcut keys={["Esc"]} label="Fecha modais e diálogos" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
          (checked ? "bg-primary" : "bg-muted")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform " +
            (checked ? "translate-x-5" : "translate-x-0.5")
          }
        />
      </button>
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
