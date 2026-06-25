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
import { Brainstorming } from "./screens/Brainstorming";
import { Tarefas } from "./screens/Tarefas";

type Tab = "hoje" | "foco" | "brainstorm" | "buscar" | "tarefas";

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

const I = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const TAB_ICON: Record<Tab, JSX.Element> = {
  hoje: <svg {...I}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  foco: <svg {...I}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>,
  brainstorm: <svg {...I}><path d="M12 3l1.6 4.2L18 8.8l-3.4 2.7L15.6 16 12 13.4 8.4 16l1-4.5L6 8.8l4.4-1.6z" /></svg>,
  buscar: <svg {...I}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  tarefas: <svg {...I}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
};
const TAB_LABEL: Record<Tab, string> = {
  hoje: "Hoje", foco: "Foco", brainstorm: "Brainstorm", buscar: "Pesquisa", tarefas: "Tarefas",
};
const TABS: Tab[] = ["hoje", "foco", "brainstorm", "buscar", "tarefas"];

function ZapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
    </svg>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("hoje");
  const [capturing, setCapturing] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
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
          <button className="capture-fab" onClick={() => setCapturing(true)} aria-label="Captura rápida" title="Capturar">
            <ZapIcon />
          </button>
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
        {tab === "foco" && <Foco />}
        {tab === "brainstorm" && <Brainstorming />}
        {tab === "buscar" && <Buscar />}
        {tab === "tarefas" && <Tarefas />}
      </main>

      <div className={"tabwrap" + (navHidden ? " hidden" : "")}>
        <button
          className="tab-handle"
          onClick={() => setNavHidden((v) => !v)}
          aria-label={navHidden ? "Mostrar menu" : "Recolher menu"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={navHidden ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
          </svg>
        </button>
        <nav className="tabbar tabbar-rail">
          {TABS.map((t) => (
            <button
              key={t}
              className={"tab-tile" + (tab === t ? " active" : "")}
              onClick={() => setTab(t)}
              aria-label={TAB_LABEL[t]}
              title={TAB_LABEL[t]}
            >
              {TAB_ICON[t]}
            </button>
          ))}
        </nav>
      </div>

      {/* Captura rápida em overlay (acionada pelo botão do header). */}
      {capturing && (
        <div className="overlay" onClick={() => setCapturing(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>Capturar</strong>
              <button className="iconbtn" onClick={() => setCapturing(false)} aria-label="Fechar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <Capturar />
          </div>
        </div>
      )}
    </div>
  );
}
