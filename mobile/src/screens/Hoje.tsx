import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { loadStreak } from "../identity";
import { enablePush, isPushEnabled, pushSupported, sendTestPush } from "../push";

type Agenda = { id: string; source: string; title: string; start_at: string | null; location: string | null };
type Contact = { id: string; name: string; reason: string | null; handle: string | null };
type GigMeta = { date?: string; city?: string | null; cache_amount?: number | null; status?: string | null };
type CatalogGig = { title: string; meta: GigMeta };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Frases curtas com gatilho de neurociência (dopamina/hábito/inércia).
const MOTIVATION = [
  "Concluir libera dopamina — comece pela tarefa mais fácil e o cérebro pede a próxima.",
  "Dois minutos vencem a inércia. Depois que começa, continuar é barato.",
  "Cada GIG fechada reforça a via neural do “eu consigo”. Repita até virar identidade.",
  "Ambiente molda comportamento: deixe o próximo passo à vista e o atrito some.",
  "Pequenas vitórias diárias reescrevem o hábito mais que grandes surtos.",
  "Foco é músculo: 1 bloco hoje deixa o de amanhã mais forte.",
  "O que você repete, você se torna. Hoje conta pro seu eu de daqui a um ano.",
];

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localDateOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null; // "dia inteiro"
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d?: string): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// Ícone por tipo de compromisso (só ícone — pouco texto, como pedido).
function SourceIcon({ source }: { source: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (source === "gig") return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>;
  if (source === "class") return <svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" /></svg>;
  // task / deadline
  return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
}

function suggestActivity(items: Agenda[]): string {
  if (items.some((i) => i.source === "gig")) return "Tempo de palco";
  if (items.some((i) => i.source === "class")) return "Aulas";
  return "Gestão";
}

export function Hoje({ onGoFocus, onGoSearch }: { onGoFocus: () => void; onGoSearch: () => void }) {
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lastGig, setLastGig] = useState<CatalogGig | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const motivation = useMemo(() => MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)], []);

  const load = useCallback(async () => {
    setLoading(true);
    const today = localToday();
    const [a, c, g, s] = await Promise.all([
      supabase.from("agenda_mirror").select("id, source, title, start_at, location").order("start_at", { ascending: true }).limit(40),
      supabase.from("contact_today").select("id, name, reason, handle").limit(8),
      supabase.from("catalog_mirror").select("title, meta").eq("kind", "gig").limit(80),
      loadStreak(),
    ]);
    setAgenda((a.data ?? []) as Agenda[]);
    setContacts((c.data ?? []) as Contact[]);
    // Última GIG = a mais recente já passada (ou de hoje).
    const gigs = ((g.data ?? []) as CatalogGig[])
      .filter((x) => typeof x.meta?.date === "string" && x.meta.date! <= today && x.meta.status !== "Cancelada")
      .sort((x, y) => (x.meta.date! < y.meta.date! ? 1 : -1));
    setLastGig(gigs[0] ?? null);
    setStreak(s);
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

  const today = localToday();
  const todays = agenda.filter((i) => localDateOf(i.start_at) === today);
  const grid = todays
    .map((i) => ({ ...i, t: timeOf(i.start_at) }))
    .filter((i) => i.t)
    .sort((a, b) => (a.t! < b.t! ? -1 : 1));

  function goFocus() {
    try {
      localStorage.setItem("vistage.foco.suggestedActivity", suggestActivity(todays));
    } catch {
      /* ok */
    }
    onGoFocus();
  }

  return (
    <div className="screen today">
      {/* Topo: streak | grade do dia */}
      <div className="today-top">
        <section className="card today-streak">
          <span className="streak-flame">🔥</span>
          <strong className="streak-num">{streak}</strong>
          <span className="muted small">{streak === 1 ? "dia seguido" : "dias seguidos"}</span>
        </section>
        <section className="card today-grid">
          <span className="label">Hoje</span>
          {grid.length === 0 ? (
            <p className="muted small" style={{ margin: "0.4rem 0 0" }}>Dia livre 🎧</p>
          ) : (
            <ul className="grid-list">
              {grid.map((i) => (
                <li key={i.id}>
                  <span className="grid-time">{i.t}</span>
                  <span className="grid-ic"><SourceIcon source={i.source} /></span>
                  <span className="grid-title">{i.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Compromissos do dia — card grande com degradê, pouco texto */}
      <section className="today-commit">
        <div className="today-commit-head">
          <strong>Compromissos de hoje</strong>
          <span className="commit-count">{todays.length}</span>
        </div>
        {todays.length === 0 ? (
          <p className="commit-empty">Nada marcado. Bom momento pra agir no que move a carreira.</p>
        ) : (
          <ul className="commit-list">
            {todays.map((i) => (
              <li key={i.id}>
                <span className={"commit-ic " + i.source}><SourceIcon source={i.source} /></span>
                <span className="commit-title">{i.title}</span>
                {timeOf(i.start_at) && <span className="commit-time">{timeOf(i.start_at)}</span>}
              </li>
            ))}
          </ul>
        )}
        {/* Sugestão de ação com link */}
        {todays.length > 0 ? (
          <button className="commit-cta" onClick={goFocus}>
            ▶ Focar agora em {suggestActivity(todays)}
          </button>
        ) : (
          <button className="commit-cta" onClick={onGoSearch}>
            Buscar contatos pra aquecer ou mapear venues →
          </button>
        )}
      </section>

      {/* Split: contatos esfriando | última GIG */}
      <div className="today-split">
        <section className="card">
          <span className="label">Esfriando</span>
          {contacts.length === 0 ? (
            <p className="muted small" style={{ margin: "0.4rem 0 0" }}>Tudo aquecido. 👌</p>
          ) : (
            <ul className="mini-list">
              {contacts.map((c) => (
                <li key={c.id}>
                  {c.handle ? (
                    <a className="link" href={`https://wa.me/${c.handle.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                  ) : (
                    <span>{c.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <span className="label">Última GIG</span>
          {lastGig ? (
            <>
              <strong className="mini-title">{lastGig.title}</strong>
              <div className="muted small">{[fmtDate(lastGig.meta.date), lastGig.meta.city].filter(Boolean).join(" · ")}</div>
              {typeof lastGig.meta.cache_amount === "number" && lastGig.meta.cache_amount > 0 && (
                <div className="muted small">{BRL.format(lastGig.meta.cache_amount)}</div>
              )}
            </>
          ) : (
            <p className="muted small" style={{ margin: "0.4rem 0 0" }}>Sem GIG ainda.</p>
          )}
        </section>
      </div>

      {/* Motivação (neurociência) */}
      <section className="card today-motivation">
        <span className="motivation-spark">✦</span>
        <p>{motivation}</p>
      </section>

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
    return null;
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
