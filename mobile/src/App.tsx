import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { currentTheme, loadAndApplyPrefs, toggleTheme } from "./theme";
import { loadHeaderInfo, type HeaderInfo } from "./identity";
import { NotificationBell } from "./components/NotificationBell";
import { IdentitySheet } from "./components/IdentitySheet";
import { Login } from "./screens/Login";

// Telas sob demanda (code-split por aba): cada uma vira um chunk próprio,
// tirando peso do bundle inicial — só a aba visível é baixada. Login fica
// eager por ser a porta de entrada. Export nomeado → mapeado pra default.
const Hoje = lazy(() => import("./screens/Hoje").then((m) => ({ default: m.Hoje })));
const Buscar = lazy(() => import("./screens/Buscar").then((m) => ({ default: m.Buscar })));
const Foco = lazy(() => import("./screens/Foco").then((m) => ({ default: m.Foco })));
const Capturar = lazy(() => import("./screens/Capturar").then((m) => ({ default: m.Capturar })));
const Brainstorming = lazy(() => import("./screens/Brainstorming").then((m) => ({ default: m.Brainstorming })));
const Tarefas = lazy(() => import("./screens/Tarefas").then((m) => ({ default: m.Tarefas })));

type Tab = "hoje" | "foco" | "brainstorm" | "buscar" | "tarefas";

const I = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const TAB_ICON: Record<Tab, JSX.Element> = {
  hoje: <svg {...I}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  foco: <svg {...I}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>,
  brainstorm: <svg {...I}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /></svg>,
  buscar: <svg {...I}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  tarefas: <svg {...I}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
};
const TAB_LABEL: Record<Tab, string> = {
  hoje: "Hoje", foco: "Foco", brainstorm: "Brainstorm", buscar: "Pesquisa", tarefas: "Tarefas",
};
// Buscar saiu da tabbar (B.2) — acesso vira lupa no header. A rota e o tipo
// continuam; só não ocupa mais um dos alvos permanentes da navegação.
const TABS: Tab[] = ["hoje", "foco", "brainstorm", "tarefas"];

// Atalhos de ícone (long-press no app): ./?go=foco abre direto a aba;
// ./?go=capturar abre a captura rápida. Lido uma vez no boot.
function readGo(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("go");
  } catch {
    return null;
  }
}
function initialTab(): Tab {
  const g = readGo();
  return g && (TABS as string[]).includes(g) ? (g as Tab) : "hoje";
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [capturing, setCapturing] = useState(() => readGo() === "capturar");
  const [navHidden, setNavHidden] = useState(false);
  const [theme, setThemeState] = useState<"light" | "dark">(currentTheme());
  const [header, setHeader] = useState<HeaderInfo>({ artistName: null, isotype: null, streak: 0 });
  const [identityOpen, setIdentityOpen] = useState(false);
  const [signOutAsk, setSignOutAsk] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session) {
        void loadAndApplyPrefs().then(setThemeState);
        void loadHeaderInfo().then(setHeader);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        void loadAndApplyPrefs().then(setThemeState);
        void loadHeaderInfo().then(setHeader);
      }
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
        <button className="identity-chip" onClick={() => setIdentityOpen(true)} aria-label="Identidade">
          {header.isotype ? (
            <img className="identity-chip-iso" src={header.isotype} alt="" />
          ) : (
            <span className="identity-chip-mono">{(header.artistName || "V").slice(0, 1).toUpperCase()}</span>
          )}
          <span className="identity-chip-name">{header.artistName || "Sua identidade"}</span>
        </button>
        <div className="topbar-actions">
          <button
            className={"iconbtn" + (tab === "buscar" ? " active" : "")}
            onClick={() => setTab("buscar")}
            aria-label="Buscar"
            title="Buscar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
          <button className="capture-fab" onClick={() => setCapturing(true)} aria-label="Capturar" title="Capturar">
            <PlusIcon />
          </button>
          <div className="bell-streak">
            <NotificationBell />
          </div>
          <button
            className="iconbtn"
            onClick={() => setSignOutAsk(true)}
            aria-label="Sair"
            title="Sair"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <main className="content">
        <Suspense fallback={<div className="center"><span className="spinner" /></div>}>
          {tab === "hoje" && <Hoje onGoFocus={() => setTab("foco")} onGoBrainstorm={() => setTab("brainstorm")} onGoTasks={() => setTab("tarefas")} />}
          {tab === "foco" && <Foco />}
          {tab === "brainstorm" && <Brainstorming />}
          {tab === "buscar" && <Buscar />}
          {tab === "tarefas" && <Tarefas onGoFocus={() => setTab("foco")} />}
        </Suspense>
      </main>

      <div className={"tabwrap" + (navHidden ? " hidden" : "")}>
        <button
          className="tab-handle"
          onClick={() => setNavHidden((v) => !v)}
          aria-label={navHidden ? "Mostrar menu" : "Recolher menu"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={navHidden ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
          </svg>
        </button>
        <nav className="tabbar tabbar-rail">
          {TABS.map((t) => (
            <button
              key={t}
              className={"glass-round tab-round" + (tab === t ? " active" : "")}
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
            <Suspense fallback={<div className="center"><span className="spinner" /></div>}>
              <Capturar />
            </Suspense>
          </div>
        </div>
      )}

      <IdentitySheet
        open={identityOpen}
        onClose={() => setIdentityOpen(false)}
        info={header}
        onReload={() => void loadHeaderInfo().then(setHeader)}
        theme={theme}
        onToggleTheme={() => setThemeState(toggleTheme())}
        onSignOut={() => {
          setIdentityOpen(false);
          setSignOutAsk(true);
        }}
      />

      {/* A.4 — sair pede confirmação (ação rara e destrutiva de sessão). */}
      {signOutAsk && (
        <div className="overlay" onClick={() => setSignOutAsk(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>Sair da conta?</strong>
              <button className="iconbtn" onClick={() => setSignOutAsk(false)} aria-label="Fechar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="muted" style={{ margin: "0 0 1rem" }}>
              Você vai precisar entrar de novo pra sincronizar com o computador.
            </p>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button className="ghost" style={{ flex: 1 }} onClick={() => setSignOutAsk(false)}>
                Cancelar
              </button>
              <button
                className="danger"
                style={{ flex: 1 }}
                onClick={() => { setSignOutAsk(false); void supabase.auth.signOut(); }}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
