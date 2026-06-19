import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { loadAndApplyPrefs } from "./theme";
import { Login } from "./screens/Login";
import { Hoje } from "./screens/Hoje";
import { Buscar } from "./screens/Buscar";
import { Foco } from "./screens/Foco";
import { Capturar } from "./screens/Capturar";

type Tab = "hoje" | "buscar" | "foco" | "capturar";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("hoje");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session) void loadAndApplyPrefs();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) void loadAndApplyPrefs();
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
        <button className="link" onClick={() => void supabase.auth.signOut()}>
          Sair
        </button>
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
