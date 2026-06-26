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

// AlertIconKey (PC) → emoji.
const ICON_EMOJI: Record<string, string> = {
  clock: "⏰",
  star: "⭐",
  flame: "🔥",
  music: "🎵",
  party: "🎉",
  book: "📖",
  heart: "❤️",
  target: "🎯",
  dollar: "💰",
  warning: "⚠️",
  trophy: "🏆",
  zap: "⚡",
};

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
            <p className="muted alerts-empty">Tudo em dia. 🎯</p>
          ) : (
            <ul className="list">
              {alerts.map((a) => (
                <li key={a.key} className={"item" + (a.critical ? " alert-crit" : "")}>
                  <span className="alert-emoji" aria-hidden>{ICON_EMOJI[a.icon] ?? "•"}</span>
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
