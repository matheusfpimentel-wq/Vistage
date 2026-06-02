import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Setup } from "@/pages/Setup";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { QuickCapture } from "@/modules/ideas/forms/QuickCapture";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm";
import { useConfigStore } from "@/lib/config";
import { useThemeStore } from "@/lib/theme";
import { loadDatabase } from "@/lib/db";
import {
  hydrateShortcuts,
  isModKey,
  matchShortcut,
  triggerNewItem,
  triggerQuickCapture,
  useQuickCaptureEvent,
} from "@/lib/shortcuts";

// Lazy-load das páginas dos módulos para que cada um vire um chunk separado.
// O FinancePage carrega o Recharts (~150kb) só quando o usuário abre o módulo.
const DashboardPage = lazy(() =>
  import("@/modules/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const GigsPage = lazy(() =>
  import("@/modules/gigs/GigsPage").then((m) => ({ default: m.GigsPage }))
);
const CrmPage = lazy(() =>
  import("@/modules/crm/CrmPage").then((m) => ({ default: m.CrmPage }))
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
const RevisaoPage = lazy(() =>
  import("@/modules/revisao/RevisaoPage").then((m) => ({ default: m.RevisaoPage }))
);
const FocoPage = lazy(() =>
  import("@/modules/foco/FocoPage").then((m) => ({ default: m.FocoPage }))
);
const ObjetivosPage = lazy(() =>
  import("@/modules/objetivos/ObjetivosPage").then((m) => ({ default: m.ObjetivosPage }))
);
const DecisoesPage = lazy(() =>
  import("@/modules/decisoes/DecisoesPage").then((m) => ({ default: m.DecisoesPage }))
);
const IdentityPage = lazy(() =>
  import("@/modules/identity/IdentityPage").then((m) => ({ default: m.IdentityPage }))
);
const TasksPage = lazy(() =>
  import("@/modules/tasks/TasksPage").then((m) => ({ default: m.TasksPage }))
);
const FinancePage = lazy(() =>
  import("@/modules/finance/FinancePage").then((m) => ({ default: m.FinancePage }))
);
const SettingsPage = lazy(() =>
  import("@/modules/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const SuppliersPage = lazy(() =>
  import("@/modules/suppliers/SuppliersPage").then((m) => ({ default: m.SuppliersPage }))
);

export default function App() {
  const { ready, config, hydrate } = useConfigStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const [booting, setBooting] = useState(true);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

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
        await loadDatabase(config.dbPath);
        if (!cancelled) {
          setDbReady(true);
          setDbError(null);
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
  }, [ready, config]);

  if (booting) return <FullscreenLoader label="Iniciando o MusicGest…" />;

  if (!ready) return <Setup />;

  if (dbError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-sm text-destructive">
          <div className="font-semibold">Falha ao abrir o banco</div>
          <div>{dbError}</div>
          <div className="text-xs opacity-80">
            Verifique se o HD externo está conectado e tente novamente.
          </div>
        </div>
      </div>
    );
  }

  if (!dbReady) return <FullscreenLoader label="Carregando banco e migrations…" />;

  return (
    <TooltipProvider delayDuration={200}>
      <ConfirmProvider>
        <BrowserRouter>
          <RoutedApp />
        </BrowserRouter>
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
            <Route path="gigs" element={<GigsPage />} />
            <Route path="venues" element={<VenuesPage />} />
            <Route path="crm" element={<CrmPage />} />
            <Route path="fornecedores" element={<SuppliersPage />} />
            <Route path="fas" element={<FansPage />} />
            <Route path="aulas" element={<ClassesPage />} />
            <Route path="musica" element={<MusicPage />} />
            <Route path="festas" element={<PartiesPage />} />
            <Route path="conteudo" element={<ContentPage />} />
            <Route path="ideias" element={<IdeasPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="revisao" element={<RevisaoPage />} />
            <Route path="foco" element={<FocoPage />} />
            <Route path="objetivos" element={<ObjetivosPage />} />
            <Route path="decisoes" element={<DecisoesPage />} />
            <Route path="identidade" element={<IdentityPage />} />
            <Route path="tarefas" element={<TasksPage />} />
            <Route path="financeiro" element={<FinancePage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <QuickCapture open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
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
