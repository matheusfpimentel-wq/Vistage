import { useEffect, useState } from "react";
import { FolderOpen, Loader2, Moon, Save, SaveAll, Sparkles, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmDialog } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useThemeStore, ACCENTS } from "@/lib/theme";
import { useDocumentStore, reloadKeepingData } from "@/lib/document";
import { isDatabaseEmpty, seedExampleData } from "@/lib/seed";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { CsvImportExport } from "./CsvImportExport";
import { TodoistSettings } from "./TodoistSettings";
import { MobileSyncSettings } from "./MobileSyncSettings";

export function SettingsPage() {
  const [seeding, setSeeding] = useState(false);
  const [canSeed, setCanSeed] = useState(false);
  const doc = useDocumentStore();
  const { theme, accent, setTheme, setAccent } = useThemeStore();

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
      setTimeout(() => reloadKeepingData(), 800);
    } catch (e) {
      toast.error(`Erro ao popular: ${String(e)}`);
    } finally {
      setSeeding(false);
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

        {/* Importação/Exportação CSV */}
        <CsvImportExport />
      </TabsContent>

      {/* ─── Integrações ─────────────────────────────────────── */}
      <TabsContent value="integracoes" className="space-y-6">
        <MobileSyncSettings />
        <TodoistSettings />
        <GoogleCalendarSettings />
      </TabsContent>

      {/* ─── Personalização ──────────────────────────────────── */}
      <TabsContent value="personalizacao" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparência</CardTitle>
            <CardDescription>Tema e cor de destaque do app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Tema</p>
              <div className="flex gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4" /> Claro
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4" /> Escuro
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Cor de destaque</p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccent(a.id)}
                    title={a.label}
                    aria-label={a.label}
                    aria-pressed={accent === a.id}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition",
                      accent === a.id ? "border-foreground" : "border-transparent hover:border-muted-foreground/40"
                    )}
                    style={{ backgroundColor: `hsl(${a.swatch})` }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

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
