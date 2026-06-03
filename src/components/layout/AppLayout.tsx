import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PanelLeftOpen, Search, Zap } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { Toaster } from "@/components/ui/toaster";
import { WorkSessionWidget } from "@/modules/foco/WorkSessionWidget";
import { useConfigStore } from "@/lib/config";
import { cn } from "@/lib/utils";
import { triggerQuickCapture } from "@/lib/shortcuts";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
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

  const title =
    TITLES[location.pathname] ??
    Object.entries(TITLES).find(([k]) =>
      k !== "/" && location.pathname.startsWith(k)
    )?.[1] ??
    "Vistage";

  const dbPath = useConfigStore((s) => s.config?.dbPath);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className={cn("transition-all duration-200", sidebarCollapsed ? "w-0 overflow-hidden" : "")}>
        <Sidebar onCollapse={() => setSidebarCollapsed(true)} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2">
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
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
            <button
              type="button"
              onClick={triggerQuickCapture}
              className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-accent"
              aria-label="Captura rápida de ideia"
              title="Captura rápida (Ctrl+I)"
            >
              <Zap className="h-4 w-4" />
            </button>
            <WorkSessionWidget />
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
