import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

// Sininho de alertas do celular. Não há tabela de alertas própria — derivamos
// do mesmo espelho que o desktop sobe (agenda/contato/saldo). Sem custo extra:
// compromissos nas próximas 48h, tarefas de hoje/atrasadas, follow-ups e cachê
// a receber. Toca pra abrir o painel; some quando está tudo em dia.

type Alert = {
  id: string;
  kind: "gig" | "class" | "task" | "contact" | "finance";
  title: string;
  detail: string;
};

type AgendaRow = { id: string; source: string; title: string; start_at: string | null };
type ContactRow = { id: string; name: string; reason: string | null };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const TAG_LABEL: Record<Alert["kind"], string> = {
  gig: "GIG",
  class: "Aula",
  task: "Tarefa",
  contact: "Contato",
  finance: "$",
};

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return (d.getTime() - Date.now()) / 3_600_000;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const hasTime = iso.includes("T");
  const d = new Date(hasTime ? iso : iso + "T00:00:00");
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return hasTime
    ? `${date} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : date;
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
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    const [a, c, f] = await Promise.all([
      supabase
        .from("agenda_mirror")
        .select("id, source, title, start_at")
        .order("start_at", { ascending: true })
        .limit(50),
      supabase.from("contact_today").select("id, name, reason"),
      supabase.from("finance_summary").select("to_receive").eq("month", month).maybeSingle(),
    ]);

    const list: Alert[] = [];
    for (const item of (a.data ?? []) as AgendaRow[]) {
      if (item.source === "task") {
        // due_date vem em start_at; vence hoje ou já passou.
        const due = item.start_at?.slice(0, 10);
        if (due && due <= today) {
          list.push({
            id: `task-${item.id}`,
            kind: "task",
            title: item.title,
            detail: due < today ? "Atrasada" : "Para hoje",
          });
        }
      } else if (item.source === "gig" || item.source === "class") {
        const h = hoursUntil(item.start_at);
        if (h != null && h >= -2 && h <= 48) {
          list.push({
            id: `${item.source}-${item.id}`,
            kind: item.source,
            title: item.title,
            detail: fmtWhen(item.start_at),
          });
        }
      }
    }
    for (const ct of (c.data ?? []) as ContactRow[]) {
      list.push({
        id: `contact-${ct.id}`,
        kind: "contact",
        title: ct.name,
        detail: ct.reason ?? "Follow-up",
      });
    }
    const toRecv = (f.data?.to_receive as number | undefined) ?? 0;
    if (toRecv > 0) {
      list.push({ id: "finance", kind: "finance", title: "A receber", detail: BRL.format(toRecv) });
    }
    setAlerts(list);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Fecha o painel ao tocar fora dele.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const count = alerts.length;
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
        {count > 0 && <span className="bell-badge">{count > 9 ? "9+" : count}</span>}
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
              {alerts.map((al) => (
                <li key={al.id} className="item">
                  <span className={"tag " + al.kind}>{TAG_LABEL[al.kind]}</span>
                  <div className="grow">
                    <strong>{al.title}</strong>
                    <span className="muted"> · {al.detail}</span>
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
