import { Outlet, useLocation } from "react-router-dom";
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
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
