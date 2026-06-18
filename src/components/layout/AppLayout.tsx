import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, PanelLeftOpen, Plus, Search, Settings } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MobileTabBar } from "./MobileTabBar";
import { FileMenu } from "./FileMenu";
import { useDocumentStore } from "@/lib/document";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { WorkSessionWidget } from "@/modules/foco/WorkSessionWidget";
import { SettingsPage } from "@/modules/settings/SettingsPage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CREATE_ITEMS = [
  { label: "Nova GIG", to: "/gigs" },
  { label: "Nova Música", to: "/musica" },
  { label: "Nova Festa", to: "/festas" },
  { label: "Nova Aula", to: "/aulas" },
  { label: "Novo Conteúdo", to: "/conteudo" },
  { label: "Nova Ideia", to: "/ideias" },
  { label: "Nova Reunião", to: "/reunioes" },
  { label: "Nova Tarefa", to: "/tarefas" },
] as const;

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  // Fecha o drawer mobile sempre que a rota muda.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Ctrl/Cmd+S salva o documento .vistage atual (estilo Office).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useDocumentStore.getState().save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fecha dropdown "+" ao clicar fora
  useEffect(() => {
    if (!createOpen) return;
    function onOutside(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [createOpen]);

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
          {/* LEFT */}
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
            {/* Expand sidebar — só no desktop quando recolhido */}
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
            {/* FileMenu */}
            <div className="hidden md:block">
              <FileMenu />
            </div>
            {/* "+" dropdown */}
            <div className="relative" ref={createRef}>
              <button
                type="button"
                onClick={() => setCreateOpen((o) => !o)}
                className="flex items-center gap-1 rounded-md border bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
                aria-label="Criar novo"
                aria-expanded={createOpen}
              >
                <Plus className="h-3.5 w-3.5" />
                <ChevronDown className={cn("h-3 w-3 transition-transform", createOpen && "rotate-180")} />
              </button>
              {createOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border bg-popover shadow-md">
                  {CREATE_ITEMS.map(({ label, to }) => (
                    <button
                      key={to}
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-popover-foreground transition hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        setCreateOpen(false);
                        void navigate(`${to}?new=1`);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            <WorkSessionWidget />
            {/* Search */}
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
            {/* Settings button */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Configurações"
              title="Configurações"
            >
              <Settings className="h-4 w-4" />
            </button>
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

      {/* Settings modal overlay */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
          </DialogHeader>
          <SettingsPage />
        </DialogContent>
      </Dialog>
    </div>
  );
}
