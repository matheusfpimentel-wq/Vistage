import { Outlet, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Toaster } from "@/components/ui/toaster";
import { useConfigStore } from "@/lib/config";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/gigs": "GIGs",
  "/crm": "CRM",
  "/tarefas": "Tarefas",
  "/financeiro": "Financeiro",
  "/configuracoes": "Configurações",
};

export function AppLayout() {
  const location = useLocation();
  const title =
    TITLES[location.pathname] ??
    Object.entries(TITLES).find(([k]) =>
      k !== "/" && location.pathname.startsWith(k)
    )?.[1] ??
    "MusicGest";

  const dbPath = useConfigStore((s) => s.config?.dbPath);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b px-6">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {dbPath && (
              <p className="text-xs text-muted-foreground truncate max-w-[60ch]">
                {dbPath}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
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
