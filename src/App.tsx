import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { AppLayout } from "@/components/layout/AppLayout";
import { Setup } from "@/pages/Setup";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { UnsavedCloseGuard } from "@/components/shared/UnsavedCloseGuard";
import { MobileChangesDialog } from "@/modules/settings/MobileChangesDialog";
import { QuickCapture } from "@/modules/ideas/forms/QuickCapture";
import { OpenDocumentDialog } from "@/components/shared/OpenDocumentDialog";
import { SessionOverlay } from "@/modules/foco/SessionOverlay";
import { isOverlayWindow } from "@/modules/foco/overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider, confirmDialog } from "@/components/ui/confirm";
import { useConfigStore } from "@/lib/config";
import { useThemeStore } from "@/lib/theme";
import { classifyDbError, closeDatabase, initDatabase } from "@/lib/db";
import { buildBackup, clearDocumentData, hasAnyDocumentData } from "@/lib/backup";
import { useDocumentStore, SKIP_BLANK_WIPE_KEY } from "@/lib/document";
import { autoGenerateRecurringUpToNow, retroactiveSyncAllLinked } from "@/modules/finance/api";

// Modelo "abre em branco": o app inicia vazio a cada boot; os dados vivem nos
// arquivos .vistage. Estas chaves controlam a transição única (1º boot) e a
// mensagem que avisa onde o backup automático foi salvo.
const BLANK_MODEL_INIT_KEY = "vistage.blankModelInit";
const TRANSITION_BACKUP_KEY = "vistage.transitionBackupPath";
import {
  hydrateShortcuts,
  isModKey,
  matchShortcut,
  triggerNewItem,
  triggerQuickCapture,
  useQuickCaptureEvent,
} from "@/lib/shortcuts";
import { useAlertNotifications } from "@/lib/notify";
import { startAutoSync } from "@/lib/mobileSync";

// Lazy-load das páginas dos módulos para que cada um vire um chunk separado.
// O FinancePage carrega o Recharts (~150kb) só quando o usuário abre o módulo.
const DashboardPage = lazy(() =>
  import("@/modules/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const RelacionamentoDashboard = lazy(() =>
  import("@/modules/dashboard/GroupDashboards").then((m) => ({ default: m.RelacionamentoDashboard }))
);
const CriacaoDashboard = lazy(() =>
  import("@/modules/dashboard/GroupDashboards").then((m) => ({ default: m.CriacaoDashboard }))
);
const GestaoDashboard = lazy(() =>
  import("@/modules/dashboard/GroupDashboards").then((m) => ({ default: m.GestaoDashboard }))
);
const TodayPage = lazy(() =>
  import("@/modules/dashboard/TodayPage").then((m) => ({ default: m.TodayPage }))
);
const MonthlyReportPage = lazy(() =>
  import("@/modules/dashboard/MonthlyReportPage").then((m) => ({ default: m.MonthlyReportPage }))
);
const MindMapPage = lazy(() =>
  import("@/modules/dashboard/MindMapPage").then((m) => ({ default: m.MindMapPage }))
);
const GigsPage = lazy(() =>
  import("@/modules/gigs/GigsPage").then((m) => ({ default: m.GigsPage }))
);
const PessoasPage = lazy(() =>
  import("@/modules/pessoas/PessoasPage").then((m) => ({ default: m.PessoasPage }))
);
const VenuesPage = lazy(() =>
  import("@/modules/venues/VenuesPage").then((m) => ({ default: m.VenuesPage }))
);
const FansPage = lazy(() =>
  import("@/modules/fans/FansPage").then((m) => ({ default: m.FansPage }))
);
const ContentPage = lazy(() =>
  import("@/modules/content/ContentPage").then((m) => ({ default: m.ContentPage }))
);
const IdeasPage = lazy(() =>
  import("@/modules/ideas/IdeasPage").then((m) => ({ default: m.IdeasPage }))
);
const ClassesPage = lazy(() =>
  import("@/modules/classes/ClassesPage").then((m) => ({ default: m.ClassesPage }))
);
const MusicPage = lazy(() =>
  import("@/modules/music/MusicPage").then((m) => ({ default: m.MusicPage }))
);
const PartiesPage = lazy(() =>
  import("@/modules/parties/PartiesPage").then((m) => ({ default: m.PartiesPage }))
);
const InsightsPage = lazy(() =>
  import("@/modules/insights/InsightsPage").then((m) => ({ default: m.InsightsPage }))
);
const AlertsPage = lazy(() =>
  import("@/modules/revisao/AlertsPage").then((m) => ({ default: m.AlertsPage }))
);

const FocoPage = lazy(() =>
  import("@/modules/foco/FocoPage").then((m) => ({ default: m.FocoPage }))
);
const ObjetivosPage = lazy(() =>
  import("@/modules/objetivos/ObjetivosPage").then((m) => ({ default: m.ObjetivosPage }))
);
const IdentityPage = lazy(() =>
  import("@/modules/identity/IdentityPage").then((m) => ({ default: m.IdentityPage }))
);
const TasksPage = lazy(() =>
  import("@/modules/tasks/TasksPage").then((m) => ({ default: m.TasksPage }))
);
const MeetingsPage = lazy(() =>
  import("@/modules/meetings/MeetingsPage").then((m) => ({ default: m.MeetingsPage }))
);
const FinancePage = lazy(() =>
  import("@/modules/finance/FinancePage").then((m) => ({ default: m.FinancePage }))
);
const SettingsPage = lazy(() =>
  import("@/modules/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const CareerWrappedPage = lazy(() =>
  import("@/modules/dashboard/CareerWrappedPage").then((m) => ({ default: m.CareerWrappedPage }))
);

export default function App() {
  // A mini-janela flutuante da sessão é puramente apresentacional:
  // não carrega config nem banco, só mostra atividade + cronômetro.
  if (isOverlayWindow()) return <SessionOverlay />;
  return <MainApp />;
}

function MainApp() {
  const { ready, config, hydrate, reset } = useConfigStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const [booting, setBooting] = useState(true);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbRetry, setDbRetry] = useState(0);

  // hidrata config + tema na primeira renderização
  useEffect(() => {
    hydrateTheme();
    (async () => {
      await hydrate();
      setBooting(false);
    })();
  }, [hydrate, hydrateTheme]);

  // sempre que tivermos um config válido, abre o banco e roda migrations
  useEffect(() => {
    if (!ready || !config) {
      setDbReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // O banco local DEVE ficar no diretório de dados do app
        // (AppData/Application Support), nunca numa pasta de nuvem (Google
        // Drive/OneDrive) — arquivos de WAL e mmap não convivem com cloud-sync.
        const dataDir = await appDataDir();
        // Numa instalação nova esse diretório pode ainda não existir — garantimos
        // a pasta antes de abrir o banco.
        if (!(await exists(dataDir))) {
          await mkdir(dataDir, { recursive: true });
        }
        const sep = dataDir.includes("\\") && !dataDir.includes("/") ? "\\" : "/";
        const replicaPath = `${dataDir.replace(/[\\/]+$/, "")}${sep}vistage-replica.db`;
        await initDatabase(replicaPath);

        // ── Abre em branco ────────────────────────────────────────────────
        // Zera os dados a cada boot (a persistência é o arquivo .vistage). O
        // reload de abrir/mesclar documento ou popular exemplos marca para
        // pular o zeramento — senão apagaria o que acabou de ser carregado.
        const skipWipe = sessionStorage.getItem(SKIP_BLANK_WIPE_KEY) === "1";
        sessionStorage.removeItem(SKIP_BLANK_WIPE_KEY);
        if (!skipWipe) {
          let safe = true;
          // Transição única: se já houver dados de uso anterior, exporta um
          // .vistage de backup antes do primeiro zeramento — nada se perde.
          if (localStorage.getItem(BLANK_MODEL_INIT_KEY) !== "1") {
            if (await hasAnyDocumentData()) {
              try {
                const backup = await buildBackup();
                const stamp = new Date().toISOString().slice(0, 10);
                const backupPath = `${dataDir.replace(/[\\/]+$/, "")}${sep}Vistage - dados anteriores ${stamp}.vistage`;
                await writeTextFile(backupPath, JSON.stringify(backup, null, 2));
                localStorage.setItem(TRANSITION_BACKUP_KEY, backupPath);
              } catch {
                safe = false; // export falhou → não zera; tenta de novo no próximo boot
              }
            }
            if (safe) localStorage.setItem(BLANK_MODEL_INIT_KEY, "1");
          }
          if (safe) {
            await clearDocumentData();
            localStorage.removeItem("vistage.currentDocument");
            useDocumentStore.setState({ currentPath: null, currentName: null, dirty: false });
          }
        }

        if (!cancelled) {
          setDbReady(true);
          setDbError(null);
          // Aparência salva NO documento (.vistage) e intenção de notificações.
          void useThemeStore.getState().hydrateFromDocument();
          void import("@/lib/notify").then(({ restoreNotificationPreference }) =>
            restoreNotificationPreference()
          );
          // Escritas automáticas de boot (recorrências, vínculos, follow-ups).
          // Elas emitem "data-changed", então só liberamos o controle de
          // "alterações não salvas" DEPOIS que todas terminam — senão o app
          // abriria sempre "sujo" e o botão de fechar pediria pra salvar à toa.
          void Promise.allSettled([
            autoGenerateRecurringUpToNow(),
            retroactiveSyncAllLinked(),
            import("@/modules/fans/api").then(({ syncSuperfanFollowupTasks }) =>
              syncSuperfanFollowupTasks()
            ),
            import("@/modules/crm/api").then(({ syncBirthdayTasks }) =>
              syncBirthdayTasks()
            ),
            import("@/modules/tasks/derived").then(({ syncDerivedTaskMarkers }) =>
              syncDerivedTaskMarkers()
            ),
          ]).then(() => {
            useDocumentStore.getState().settleBoot();
          });
        }
      } catch (e) {
        if (!cancelled) {
          setDbReady(false);
          setDbError(String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, config, dbRetry]);

  if (booting) return <FullscreenLoader label="Iniciando o Vistage…" />;

  if (!ready) return <Setup />;

  if (dbError) {
    const info = classifyDbError(dbError);
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-sm text-destructive">
          <div className="font-semibold">{info.title}</div>
          <div className="text-xs opacity-90">{info.hint}</div>
          <details className="text-xs opacity-70">
            <summary className="cursor-pointer">Detalhes técnicos</summary>
            <div className="mt-1 break-words font-mono">{dbError}</div>
          </details>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setDbError(null);
                setDbRetry((n) => n + 1);
              }}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={async () => {
                await closeDatabase().catch(() => {});
                setDbError(null);
                setDbReady(false);
                reset();
              }}
              className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium"
            >
              Escolher outra pasta
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dbReady) return <FullscreenLoader label="Conectando ao banco…" />;

  return (
    <TooltipProvider delayDuration={200}>
      <ConfirmProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <RoutedApp />
          </BrowserRouter>
        </ErrorBoundary>
      </ConfirmProvider>
    </TooltipProvider>
  );
}

function RoutedApp() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  // Atalhos globais — letras customizáveis em Configurações.
  // Hidrata uma vez na primeira renderização.
  useEffect(() => {
    void hydrateShortcuts();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isModKey(e)) return;
      const action = matchShortcut(e);
      if (!action) return;
      if (action === "search") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      } else if (action === "quickCapture") {
        e.preventDefault();
        triggerQuickCapture();
      } else if (action === "newItem") {
        // não interferir quando o foco está em um input do command palette
        const target = e.target as HTMLElement | null;
        if (target && /input|textarea/i.test(target.tagName)) return;
        e.preventDefault();
        triggerNewItem();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useQuickCaptureEvent(() => setQuickCaptureOpen(true));

  // Notificações locais do sistema para alertas críticos.
  useAlertNotifications();

  // Sincronização mobile automática (só age se o usuário estiver logado no
  // Supabase): ao abrir, a cada 3 min e via Realtime quando o celular captura.
  useEffect(() => startAutoSync(), []);

  // Mensagem única da transição para o modelo "abre em branco": avisa onde os
  // dados anteriores foram salvos automaticamente. O atraso garante que o
  // provider de diálogos já esteja montado.
  useEffect(() => {
    const path = localStorage.getItem(TRANSITION_BACKUP_KEY);
    if (!path) return;
    localStorage.removeItem(TRANSITION_BACKUP_KEY);
    const t = setTimeout(() => {
      void confirmDialog({
        title: "O Vistage agora abre em branco",
        description: `A cada inicialização o app começa vazio — seus dados ficam em arquivos .vistage. Salvamos seus dados anteriores em "${path}". Use Arquivo → Abrir… para carregá-los.`,
        confirmLabel: "Entendi",
        cancelLabel: "Fechar",
      });
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        }
      >
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="hoje" element={<TodayPage />} />
            <Route path="relatorio" element={<MonthlyReportPage />} />
            <Route path="mapa" element={<MindMapPage />} />
            <Route path="relacionamento" element={<RelacionamentoDashboard />} />
            <Route path="criacao" element={<CriacaoDashboard />} />
            <Route path="gestao" element={<GestaoDashboard />} />
            <Route path="alertas" element={<AlertsPage />} />
            <Route path="gigs" element={<GigsPage />} />
            <Route path="venues" element={<VenuesPage />} />
            <Route path="pessoas" element={<PessoasPage />} />
            {/* Páginas antigas aposentadas → redirecionam para a visão unificada Pessoas. */}
            <Route path="crm" element={<Navigate to="/pessoas" replace />} />
            <Route path="fornecedores" element={<Navigate to="/pessoas" replace />} />
            <Route path="fas" element={<FansPage />} />
            <Route path="aulas" element={<ClassesPage />} />
            <Route path="musica" element={<MusicPage />} />
            <Route path="festas" element={<PartiesPage />} />
            <Route path="conteudo" element={<ContentPage />} />
            <Route path="ideias" element={<IdeasPage />} />
            <Route path="insights" element={<InsightsPage />} />

            <Route path="foco" element={<FocoPage />} />
            <Route path="objetivos" element={<ObjetivosPage />} />

            <Route path="identidade" element={<IdentityPage />} />
            <Route path="tarefas" element={<TasksPage />} />
            <Route path="reunioes" element={<MeetingsPage />} />
            <Route path="financeiro" element={<FinancePage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="carreira" element={<CareerWrappedPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <QuickCapture open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
      <OpenDocumentDialog />
      <UnsavedCloseGuard />
      <MobileChangesDialog />
    </>
  );
}

function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
