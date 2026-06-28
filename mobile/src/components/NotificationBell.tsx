import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

// Sininho do celular = MESMOS alertas do PC. O desktop computa (computeAlerts +
// regras próprias) e sobe pra alerts_mirror; aqui a gente só lê e mostra.

type Alert = {
  key: string;
  label: string;
  route: string | null;
  critical: boolean;
  icon: string;
};

// AlertIconKey (PC) → ícone SVG (sem emoji; mesmo conjunto do desktop/lucide).
const II = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function AlertIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "clock": return <svg {...II}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "star": return <svg {...II}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.9z" /></svg>;
    case "flame": return <svg {...II}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>;
    case "music": return <svg {...II}><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><path d="M9 18V5l12-2v13" /></svg>;
    case "party": return <svg {...II}><path d="M2 22l5-15 10 10z" /><path d="M14 7a3 3 0 0 0-3-3M17 4a6 6 0 0 0-6-2" /></svg>;
    case "book": return <svg {...II}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "heart": return <svg {...II}><path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
    case "target": return <svg {...II}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>;
    case "dollar": return <svg {...II}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
    case "warning": return <svg {...II}><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "trophy": return <svg {...II}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M5 9a3 3 0 0 1-3-3V5h3M19 9a3 3 0 0 0 3-3V5h-3" /></svg>;
    case "zap": return <svg {...II}><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></svg>;
    default: return <svg {...II}><circle cx="12" cy="12" r="2" /></svg>;
  }
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("alerts_mirror")
      .select("key, label, route, critical, icon")
      .order("critical", { ascending: false });
    setAlerts((data ?? []) as Alert[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const count = alerts.length;
  const criticalCount = alerts.filter((a) => a.critical).length;

  return (
    <div className="bell-wrap" ref={ref}>
      <button
        className="iconbtn"
        onClick={() => {
          if (!open) void load();
          setOpen((o) => !o);
        }}
        aria-label={count > 0 ? `${count} alertas` : "Alertas"}
      >
        <BellIcon />
        {count > 0 && (
          <span className={"bell-badge" + (criticalCount > 0 ? " crit" : "")}>{count > 9 ? "9+" : count}</span>
        )}
      </button>
      {open && (
        <div className="alerts-panel">
          <div className="alerts-head">
            <strong>Alertas</strong>
            <button className="link" onClick={() => void load()}>
              Atualizar
            </button>
          </div>
          {count === 0 ? (
            <p className="muted alerts-empty">Tudo em dia.</p>
          ) : (
            <ul className="list">
              {alerts.map((a) => (
                <li key={a.key} className={"item" + (a.critical ? " alert-crit" : "")}>
                  <span className="alert-emoji" aria-hidden><AlertIcon icon={a.icon} /></span>
                  <div className="grow">
                    <span>{a.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
