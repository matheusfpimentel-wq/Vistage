import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CloudDownload,
  CloudUpload,
  FolderOpen,
  Loader2,
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
import { pushToTurso } from "@/lib/db";
import { useDocumentStore } from "@/lib/document";
import { DEFAULT_TURSO_TOKEN, DEFAULT_TURSO_URL } from "@/lib/turso-defaults";
import { isDatabaseEmpty, seedExampleData } from "@/lib/seed";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { GoogleDriveSettings } from "./GoogleDriveSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { CsvImportExport } from "./CsvImportExport";
import { TodoistSettings } from "./TodoistSettings";
import { DbDiagnostics } from "./DbDiagnostics";

export function SettingsPage() {
  const { config, patchConfig } = useConfigStore();
  const [seeding, setSeeding] = useState(false);
  const [canSeed, setCanSeed] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  const autoCloud = config?.autoCloudSave !== false; // default ligado
  const doc = useDocumentStore();

  useEffect(() => {
    void isDatabaseEmpty().then(setCanSeed);
  }, []);

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
        ? "Sync automático na nuvem ligado."
        : "Sync automático desligado — usando só o arquivo local. Envie com 'Salvar manualmente' quando quiser."
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

  return (
    <Tabs defaultValue="salvamento" className="space-y-4">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="salvamento">Salvamento</TabsTrigger>
        <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        <TabsTrigger value="personalizacao">Personalização</TabsTrigger>
      </TabsList>

      {/* ─── Salvamento ──────────────────────────────────────── */}
      <TabsContent value="salvamento" className="space-y-6">
        {/* Nuvem */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salvamento em nuvem (Turso)</CardTitle>
            <CardDescription>
              Sincroniza seus dados entre computadores via Turso. Se você
              trabalha <strong>só pelo arquivo .vistage</strong> (abrir/salvar),
              pode <strong>desligar</strong> e usar apenas o arquivo — sem o sync
              automático, que é o que pode causar divergência entre máquinas. Os
              dados continuam salvos localmente e no arquivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle
              checked={autoCloud}
              onChange={handleToggleAutoCloud}
              label="Salvamento em nuvem automático"
              hint={autoCloud ? undefined : "Desligado — usando só o arquivo local (.vistage), sem sync automático"}
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
      </TabsContent>

      {/* ─── Personalização ──────────────────────────────────── */}
      <TabsContent value="personalizacao" className="space-y-6">
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

