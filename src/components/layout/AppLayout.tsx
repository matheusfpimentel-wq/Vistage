import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PanelLeftOpen, Search, Zap } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MobileTabBar } from "./MobileTabBar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { Toaster } from "@/components/ui/toaster";
import { SyncIndicator } from "@/components/shared/SyncIndicator";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { WorkSessionWidget } from "@/modules/foco/WorkSessionWidget";
import { useConfigStore } from "@/lib/config";
import { cn } from "@/lib/utils";
import { triggerQuickCapture } from "@/lib/shortcuts";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/hoje": "Hoje",
  "/relatorio": "Relatório mensal",
  "/mapa": "Mapa mental",
  "/operacao": "Operação",
  "/relacionamento": "Relacionamento",
  "/criacao": "Criação",
  "/gestao": "Gestão",
  "/alertas": "Alertas",
  "/gigs": "GIGs",
  "/venues": "Venues",
  "/crm": "CRM",
  "/fas": "Clube de fãs",
  "/aulas": "Aulas",
  "/conteudo": "Gestão de Conteúdo",
  "/ideias": "Ideias & Insights",
  "/musica": "Produção Musical",
  "/festas": "Produção de Festas",
  "/fornecedores": "Fornecedores",
  "/foco": "Energia & Foco",
  "/objetivos": "OKRs",

  "/identidade": "Identidade Artística",
  "/tarefas": "Tarefas",
  "/financeiro": "Financeiro",
  "/configuracoes": "Configurações",
};

export function AppLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Fecha o drawer mobile sempre que a rota muda.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const title =
    TITLES[location.pathname] ??
    Object.entries(TITLES).find(([k]) =>
      k !== "/" && location.pathname.startsWith(k)
    )?.[1] ??
    "Vistage";

  const dbPath = useConfigStore((s) => s.config?.dbPath);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar fixa — só no desktop */}
      <div className={cn("hidden md:block transition-all duration-200", sidebarCollapsed ? "w-0 overflow-hidden" : "")}>
        <Sidebar onCollapse={() => setSidebarCollapsed(true)} />
      </div>

      {/* Drawer mobile — overlay + sidebar deslizante */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Hamburguer — só no mobile */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
              aria-label="Abrir menu"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Expandir painel lateral"
                title="Expandir painel lateral"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-semibold">{title}</h1>
              {!sidebarCollapsed && dbPath && (
                <p className="text-xs text-muted-foreground truncate max-w-[40ch]">
                  {dbPath}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => {
                  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
                  const ev = new KeyboardEvent("keydown", {
                    key: "k",
                    ctrlKey: !isMac,
                    metaKey: isMac,
                    bubbles: true,
                  });
                  window.dispatchEvent(ev);
                }}
                className="hidden sm:inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-accent"
                aria-label="Abrir busca global"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Buscar…</span>
                <kbd className="ml-2 rounded border bg-background px-1.5 py-0.5 text-[10px]">
                  Ctrl K
                </kbd>
              </button>
            )}
            <WorkSessionWidget />
            <button
              type="button"
              onClick={triggerQuickCapture}
              className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md transition hover:bg-accent"
              aria-label="Captura rápida de ideia"
              title="Captura rápida (Ctrl+I)"
            >
              <Zap className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        {/* pb-20 no mobile reserva espaço para a barra inferior fixa */}
        <main className="flex-1 overflow-auto p-3 pb-20 sm:p-6 md:pb-6">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <MobileTabBar onOpenMenu={() => setMobileNavOpen(true)} />
      </div>
      <Toaster />
      <SyncIndicator />
    </div>
  );
}
