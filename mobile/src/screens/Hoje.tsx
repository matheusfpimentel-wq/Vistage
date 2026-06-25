import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { enablePush, isPushEnabled, pushSupported, sendTestPush } from "../push";

type Agenda = { id: string; source: string; title: string; start_at: string | null; location: string | null };
type Finance = { month: string; balance: number; to_receive: number };
type Contact = { id: string; name: string; reason: string | null; handle: string | null };
type FocusPayload = {
  total_minutes?: number;
  avg_energy?: number | null;
  avg_focus?: number | null;
  by_activity?: { activity_type: string; minutes: number }[];
};
type Focus = { week: string; payload: FocusPayload };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const SOURCE_LABEL: Record<string, string> = { gig: "GIG", class: "Aula", task: "Tarefa" };

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  // start_at agora vem sempre com fuso; "dia inteiro" = meia-noite local.
  const allDay = d.getHours() === 0 && d.getMinutes() === 0;
  return allDay
    ? date
    : `${date} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Hoje() {
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [fin, setFin] = useState<Finance | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const month = new Date().toISOString().slice(0, 7);
    const [a, f, c, fo] = await Promise.all([
      supabase.from("agenda_mirror").select("id, source, title, start_at, location").order("start_at", { ascending: true }).limit(20),
      supabase.from("finance_summary").select("month, balance, to_receive").eq("month", month).maybeSingle(),
      supabase.from("contact_today").select("id, name, reason, handle"),
      supabase.from("focus_metrics").select("week, payload").order("week", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setAgenda((a.data ?? []) as Agenda[]);
    setFin((f.data as Finance | null) ?? null);
    setContacts((c.data ?? []) as Contact[]);
    setFocus((fo.data as Focus | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="center">
        <span className="spinner" />
      </div>
    );
  }

  const fp = focus?.payload;
  return (
    <div className="screen">
      <section className="card finance">
        <div className="row">
          <div>
            <span className="label">Saldo do mês</span>
            <strong className={"big " + ((fin?.balance ?? 0) < 0 ? "neg" : "pos")}>
              {BRL.format(fin?.balance ?? 0)}
            </strong>
          </div>
          <div className="right">
            <span className="label">A receber</span>
            <strong className="big">{BRL.format(fin?.to_receive ?? 0)}</strong>
          </div>
        </div>
      </section>

      <h2>Agenda</h2>
      {agenda.length === 0 ? (
        <p className="muted">Nada por vir.</p>
      ) : (
        <ul className="list">
          {agenda.map((item) => (
            <li key={item.id} className="item">
              <span className={"tag " + item.source}>{SOURCE_LABEL[item.source] ?? item.source}</span>
              <div className="grow">
                <strong>{item.title}</strong>
                {item.location && <span className="muted"> · {item.location}</span>}
              </div>
              <span className="when">{fmtWhen(item.start_at)}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Contato do dia</h2>
      {contacts.length === 0 ? (
        <p className="muted">Sem follow-ups.</p>
      ) : (
        <ul className="list">
          {contacts.map((c) => (
            <li key={c.id} className="item">
              <div className="grow">
                <strong>{c.name}</strong>
                {c.reason && <span className="muted"> · {c.reason}</span>}
              </div>
              {c.handle && (
                <a
                  className="link"
                  href={`https://wa.me/${c.handle.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Foco da semana</h2>
      {fp ? (
        <section className="card">
          <div className="row">
            <div>
              <span className="label">Tempo</span>
              <strong className="big">{Math.round(((fp.total_minutes ?? 0) / 60) * 10) / 10}h</strong>
            </div>
            <div>
              <span className="label">Energia</span>
              <strong className="big">{fp.avg_energy ?? "—"}</strong>
            </div>
            <div className="right">
              <span className="label">Foco</span>
              <strong className="big">{fp.avg_focus ?? "—"}</strong>
            </div>
          </div>
          {fp.by_activity && fp.by_activity.length > 0 && (
            <ul className="bars">
              {fp.by_activity.map((b) => (
                <li key={b.activity_type}>
                  <span>{b.activity_type}</span>
                  <span className="muted">{Math.round(b.minutes)} min</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="muted">Sem sessões esta semana.</p>
      )}

      <h2>Notificações</h2>
      <NotificationsCard />

      <button className="ghost full" onClick={() => void load()}>
        Atualizar
      </button>
    </div>
  );
}

function NotificationsCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void isPushEnabled().then(setEnabled);
  }, []);

  if (!pushSupported()) {
    return <p className="muted">Este navegador não suporta notificações.</p>;
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    const r = await enablePush();
    setBusy(false);
    if (r.ok) {
      setEnabled(true);
      setMsg("Notificações ativadas. Resumo diário às 8h.");
    } else {
      setMsg(r.reason ?? "Não consegui ativar.");
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await sendTestPush();
    setBusy(false);
    setMsg(r.ok ? "Resumo enviado — deve chegar em instantes." : r.reason ?? "Falhou.");
  }

  return (
    <section className="card">
      <div className="row">
        <div>
          <span className="label">Resumo diário + lembretes</span>
          <strong>{enabled == null ? "…" : enabled ? "Ativas" : "Desativadas"}</strong>
        </div>
        <div className="right">
          {enabled ? (
            <button className="ghost" disabled={busy} onClick={() => void test()}>
              {busy ? "…" : "Testar"}
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void enable()}>
              {busy ? "…" : "Ativar"}
            </button>
          )}
        </div>
      </div>
      {msg && <p className="muted stage-sub" style={{ marginBottom: 0, marginTop: "0.5rem" }}>{msg}</p>}
    </section>
  );
}
