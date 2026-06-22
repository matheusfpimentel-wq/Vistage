import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { currentTheme, loadAndApplyPrefs, toggleTheme } from "./theme";
import { NotificationBell } from "./components/NotificationBell";
import { Login } from "./screens/Login";
import { Hoje } from "./screens/Hoje";
import { Buscar } from "./screens/Buscar";
import { Foco } from "./screens/Foco";
import { Capturar } from "./screens/Capturar";

type Tab = "hoje" | "buscar" | "foco" | "capturar";

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("hoje");
  const [theme, setThemeState] = useState<"light" | "dark">(currentTheme());

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session) void loadAndApplyPrefs().then(setThemeState);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) void loadAndApplyPrefs().then(setThemeState);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="center">
        <span className="spinner" />
      </div>
    );
  }
  if (!session) return <Login />;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Vistage</span>
        <div className="topbar-actions">
          <button
            className="iconbtn"
            onClick={() => setThemeState(toggleTheme())}
            aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <NotificationBell />
          <button className="link" onClick={() => void supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </header>
      <main className="content">
        {tab === "hoje" && <Hoje />}
        {tab === "buscar" && <Buscar />}
        {tab === "foco" && <Foco />}
        {tab === "capturar" && <Capturar />}
      </main>
      <nav className="tabbar tabbar-4">
        <button className={tab === "hoje" ? "active" : ""} onClick={() => setTab("hoje")}>
          Hoje
        </button>
        <button className={tab === "buscar" ? "active" : ""} onClick={() => setTab("buscar")}>
          Buscar
        </button>
        <button className={tab === "foco" ? "active" : ""} onClick={() => setTab("foco")}>
          Foco
        </button>
        <button className={tab === "capturar" ? "active" : ""} onClick={() => setTab("capturar")}>
          Capturar
        </button>
      </nav>
    </div>
  );
}
