import { useEffect, useState } from "react";
import { Loader2, Moon, ShieldAlert, Sparkles, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmDialog } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useThemeStore, ACCENTS } from "@/lib/theme";
import { persistDocSetting } from "@/lib/docSettings";
import {
  loadMindColorOverrides,
  MIND_COLORS_KEY,
  MIND_TYPE_META,
  type MindNodeType,
} from "@/modules/dashboard/mindmap";
import { reloadKeepingData } from "@/lib/document";
import { isDatabaseEmpty, seedExampleData } from "@/lib/seed";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { CsvImportExport } from "./CsvImportExport";
import { DiscardedCapturesCard } from "./DiscardedCapturesCard";
import { BackupSettings } from "./BackupSettings";
import { TodoistSettings } from "./TodoistSettings";
import { NotionSettings } from "./NotionSettings";
import { GoogleDriveSettings } from "./GoogleDriveSettings";
import { MobileSyncSettings } from "./MobileSyncSettings";
import { AdvancedRulesSettings } from "./AdvancedRulesSettings";
import { InsightsBankSettings } from "./InsightsBankSettings";

export function SettingsPage() {
  const [seeding, setSeeding] = useState(false);
  const [canSeed, setCanSeed] = useState(false);
  const { theme, accent, setTheme, setAccent, sidebarLayout, setSidebarLayout } = useThemeStore();

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
    <Tabs defaultValue="personalizacao" className="space-y-4">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="personalizacao">Personalização</TabsTrigger>
        <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        <TabsTrigger value="avancado">Configurações avançadas</TabsTrigger>
        <TabsTrigger value="backup">Backup</TabsTrigger>
      </TabsList>

      {/* ─── Configurações avançadas (alertas + insights) ─── */}
      <TabsContent value="avancado" className="space-y-4">
        <Tabs defaultValue="alertas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="alertas">Alertas</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>
          <TabsContent value="alertas">
            <AdvancedRulesSettings />
          </TabsContent>
          <TabsContent value="insights">
            <InsightsBankSettings />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* ─── Backup (CSV) ────────────────────────────────────── */}
      <TabsContent value="backup" className="space-y-6">
        {/* Aviso: o .vistage carrega credenciais em texto puro */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="leading-snug">
            <span className="font-medium">Cuidado ao compartilhar.</span> Para o
            arquivo abrir pronto em outra máquina, o <code>.vistage</code> guarda
            tudo — inclusive suas senhas, tokens das integrações (Google,
            Todoist) e o login de sincronização. Trate-o como uma senha: não
            envie para terceiros.
          </p>
        </div>
        {/* Backups rotativos (cópia a cada salvamento) */}
        <BackupSettings />
        {/* Importação/Exportação CSV */}
        <CsvImportExport />
        {/* Capturas do celular descartadas (recuperáveis) */}
        <DiscardedCapturesCard />
      </TabsContent>

      {/* ─── Integrações ─────────────────────────────────────── */}
      <TabsContent value="integracoes" className="space-y-6">
        <MobileSyncSettings />
        <TodoistSettings />
        <NotionSettings />
        <GoogleCalendarSettings />
        <GoogleDriveSettings />
      </TabsContent>

      {/* ─── Personalização ──────────────────────────────────── */}
      <TabsContent value="personalizacao" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparência</CardTitle>
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
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Menu lateral</p>
              <div className="flex gap-2">
                <Button
                  variant={sidebarLayout === "classic" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSidebarLayout("classic")}
                >
                  Clássico
                </Button>
                <Button
                  variant={sidebarLayout === "rail" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSidebarLayout("rail")}
                >
                  Ícones
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <MindMapColorsCard />

        <ShortcutSettings />

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

/** Personalização das cores das entidades do mapa mental (portátil no .vistage). */
function MindMapColorsCard() {
  const [colors, setColors] = useState<Partial<Record<MindNodeType, string>>>(
    () => loadMindColorOverrides()
  );

  function persist(next: Partial<Record<MindNodeType, string>>) {
    setColors(next);
    persistDocSetting(MIND_COLORS_KEY, JSON.stringify(next));
  }

  function setColor(type: MindNodeType, hex: string) {
    persist({ ...colors, [type]: hex });
  }

  const types = Object.keys(MIND_TYPE_META) as MindNodeType[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cores do mapa mental</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {types.map((t) => {
            const meta = MIND_TYPE_META[t];
            const current = colors[t] || meta.color;
            return (
              <div key={t} className="flex items-center gap-2">
                <input
                  type="color"
                  value={current}
                  onChange={(e) => setColor(t, e.target.value)}
                  aria-label={`Cor de ${meta.label}`}
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <span className="flex-1 truncate text-sm">{meta.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
