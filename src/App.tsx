import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Setup } from "@/pages/Setup";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { GigsPage } from "@/modules/gigs/GigsPage";
import { CrmPage } from "@/modules/crm/CrmPage";
import { TasksPage } from "@/modules/tasks/TasksPage";
import { FinancePage } from "@/modules/finance/FinancePage";
import { SettingsPage } from "@/modules/settings/SettingsPage";
import { useConfigStore } from "@/lib/config";
import { useThemeStore } from "@/lib/theme";
import { loadDatabase } from "@/lib/db";

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
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="gigs" element={<GigsPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="tarefas" element={<TasksPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
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
