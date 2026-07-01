import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { loadStreak } from "../identity";
import { enablePush, isPushEnabled, pushSupported, sendTestPush } from "../push";
import { reconcileLocalGigs, type LocalGig } from "../localGigs";
import { telLink, waLink, mapsLink } from "../links";

type Agenda = { id: string; source: string; source_id?: string; title: string; start_at: string | null; location: string | null };
// "Esfriando": item que o artista alimenta e ficou parado. O tipo vem no prefixo
// do source_id ("contact:" / "fan:" / "track:" / "content:") — espelho gerado no
// desktop. Sem prefixo (espelho antigo) cai em "contact".
type Cold = { id: string; source_id: string; name: string; reason: string | null; handle: string | null };
type ColdKind = "contact" | "fan" | "track" | "content";
function coldKind(c: Cold): ColdKind {
  const p = (c.source_id || "").split(":")[0];
  return p === "fan" || p === "track" || p === "content" ? p : "contact";
}
function isPerson(c: Cold): boolean {
  const k = coldKind(c);
  return k === "contact" || k === "fan";
}
function ColdIcon({ kind }: { kind: ColdKind }) {
  const p = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "fan") return <svg {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
  if (kind === "track") return <svg {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M8.5 18V6l11-2v12" /></svg>;
  if (kind === "content") return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3V9z" /></svg>;
  return <svg {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
const COLD_KIND_LABEL: Record<ColdKind, string> = { contact: "Contato", fan: "Fã", track: "Faixa", content: "Conteúdo" };
type StageSlot = { start: string; end: string };
type GigMeta = {
  date?: string;
  city?: string | null;
  venue_name?: string | null;
  address?: string | null;
  cache_amount?: number | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  set_periods?: StageSlot[];
  day_contact_name?: string | null;
  day_contact_phone?: string | null;
  promoter_name?: string | null;
};
type CatalogGig = { title: string; meta: GigMeta };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// §8: no lugar da neurociência de pôster, um lembrete com DADO REAL (streak,
// compromissos, contato esfriando, última GIG).
function realLine(streak: number, upcomingCount: number, cold: Cold | null, lastGig: CatalogGig | null): string {
  if (streak >= 2) return `${streak} dias seguidos de foco — não quebra a corrente hoje.`;
  if (upcomingCount > 0)
    return `Você tem ${upcomingCount} compromisso${upcomingCount > 1 ? "s" : ""} à frente. Um passo agora encurta a lista.`;
  if (cold) return `Faz tempo que você não fala com ${cold.name.split(" ")[0]}. Um "oi" reaquece.`;
  if (lastGig) return `Última GIG: ${lastGig.title}. Já anotou o que funcionou?`;
  return "Comece pequeno: um bloco de foco hoje conta pro seu eu de daqui a um ano.";
}

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

/** "hoje 22:00" / "12 jul 23:00" / "amanhã" — rótulo curto de quando. */
function whenLabel(iso: string | null, today: string): string {
  if (!iso) return "";
  const d = localDateOf(iso);
  const t = timeOf(iso);
  if (d === today) return t ? `hoje ${t}` : "hoje";
  return t ? `${fmtDate(d ?? undefined)} ${t}` : fmtDate(d ?? undefined);
}

// Ícone por tipo de compromisso (só ícone — pouco texto, como pedido).
function SourceIcon({ source }: { source: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (source === "gig") return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>;
  if (source === "class") return <svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" /></svg>;
  if (source === "meeting") return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  // task / deadline
  return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
}

function suggestActivity(items: Agenda[]): string {
  if (items.some((i) => i.source === "gig")) return "Tempo de palco";
  if (items.some((i) => i.source === "class")) return "Aulas";
  return "Gestão";
}

export function Hoje({
  onGoFocus,
  onGoBrainstorm,
}: {
  onGoFocus: () => void;
  onGoBrainstorm: () => void;
}) {
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [cooling, setCooling] = useState<Cold[]>([]);
  const [coldOpen, setColdOpen] = useState<Cold | null>(null);
  const [lastGig, setLastGig] = useState<CatalogGig | null>(null);
  const [todayGig, setTodayGig] = useState<CatalogGig | null>(null);
  const [localGigs, setLocalGigs] = useState<LocalGig[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = localToday();
    const [a, c, g, s] = await Promise.all([
      supabase.from("agenda_mirror").select("id, source, source_id, title, start_at, location").order("start_at", { ascending: true }).limit(40),
      supabase.from("contact_today").select("id, source_id, name, reason, handle").limit(12),
      supabase.from("catalog_mirror").select("title, meta, search_text").eq("kind", "gig").limit(80),
      loadStreak(),
    ]);
    setAgenda((a.data ?? []) as Agenda[]);
    setCooling((c.data ?? []) as Cold[]);
    // GIGs criadas no celular ainda não sincronizadas: reconcilia contra o espelho
    // (mesma data + casa no search_text) e guarda as que continuam pendentes.
    const gigRows = (g.data ?? []) as (CatalogGig & { search_text?: string })[];
    setLocalGigs(
      await reconcileLocalGigs(
        gigRows.map((r) => ({
          date: typeof r.meta?.date === "string" ? r.meta.date : null,
          hay: ((r.search_text ?? r.title) || "").toLowerCase(),
        }))
      )
    );
    // Última GIG = a mais recente já passada (ou de hoje).
    const gigs = ((g.data ?? []) as CatalogGig[])
      .filter((x) => typeof x.meta?.date === "string" && x.meta.date! <= today && x.meta.status !== "Cancelada")
      .sort((x, y) => (x.meta.date! < y.meta.date! ? 1 : -1));
    setLastGig(gigs[0] ?? null);
    // GIG de HOJE (se houver) → ativa a variante "dia de GIG" da Home.
    const todayGigs = ((g.data ?? []) as CatalogGig[])
      .filter((x) => x.meta?.date === today && x.meta.status !== "Cancelada")
      .sort((x, y) => (x.meta.start_time ?? "").localeCompare(y.meta.start_time ?? ""));
    setTodayGig(todayGigs[0] ?? null);
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
  // Grade do dia = itens de HOJE (qualquer um). Compromissos = próximos (hoje +
  // futuro), porque o que importa é o que vem, não só hoje.
  const todays = agenda.filter((i) => localDateOf(i.start_at) === today);
  const grid = todays
    .map((i) => ({ ...i, t: timeOf(i.start_at) }))
    .sort((a, b) => (a.t ?? "99") < (b.t ?? "99") ? -1 : 1);
  // GIGs criadas no celular (pendentes) viram compromissos sintéticos pra
  // aparecer JÁ, com data >= hoje. id "local:" marca o selo "pendente".
  const localUpcoming: Agenda[] = localGigs
    .filter((g) => !g.date || g.date >= today)
    .map((g) => ({
      id: "local:" + g.client_ref,
      source: "gig",
      source_id: undefined,
      title: g.venue_name,
      start_at: g.date ? `${g.date}T21:00:00` : null,
      location: g.city,
    }));
  const upcoming = [
    ...localUpcoming,
    ...agenda.filter((i) => i.start_at == null || (localDateOf(i.start_at) ?? "") >= today),
  ]
    .sort((a, b) => {
      const da = localDateOf(a.start_at) ?? "9999-99-99";
      const db = localDateOf(b.start_at) ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    })
    .slice(0, 10);
  // Pro CTA "reaquecer" e pra frase do dia: o 1º item que é PESSOA (contato/fã),
  // pois faixa/conteúdo não se "fala". A lista de esfriando mostra todos.
  const coldPerson = cooling.find(isPerson) ?? null;
  const motivation = realLine(streak, upcoming.length, coldPerson, lastGig);
  // Dia sem nada na grade → sugere a ação mais "pesada" (maior pendência primeiro):
  // esfriando > compromissos à frente > brainstorm.
  const daySuggestion =
    cooling.length > 0
      ? { text: `${cooling.length} esfriando — reaquecer`, onClick: () => setColdOpen(cooling[0]) }
      : upcoming.length > 0
        ? { text: "Prepare o que vem", onClick: () => goFocus() }
        : { text: "Solte uma ideia", onClick: onGoBrainstorm };

  function goFocus() {
    try {
      localStorage.setItem("vistage.foco.suggestedActivity", suggestActivity(upcoming));
    } catch {
      /* ok */
    }
    onGoFocus();
  }

  // Play numa tarefa → abre o Modo Foco em "Gestão" já focado nessa tarefa
  // (mostra o checklist dela). A tarefa viaja pelo localStorage.
  function startFocusOnTask(taskId: string, title: string) {
    try {
      localStorage.setItem("vistage.foco.task", JSON.stringify({ id: taskId, title }));
      localStorage.setItem("vistage.foco.suggestedActivity", "Gestão");
    } catch {
      /* ok */
    }
    onGoFocus();
  }

  return (
    <div className="screen today">
      {/* §4: variante "dia de GIG" — lidera com a noite. */}
      {todayGig && <GigDayHero gig={todayGig} onFocus={goFocus} />}

      {/* Topo: streak | grade do dia */}
      <div className="today-top">
        <section className="card today-streak">
          <div className="streak-main">
            <span className="streak-flame" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3 3 4.5 4.5 6.5C18 10.5 19 12.4 19 14.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.3 1.3 2.2 2.5 2.2a2.5 2.5 0 0 0 2.5-2.5c0-1.4-.8-2.2-1.3-3.2C10.7 6.3 11 4 12 2z" /></svg>
            </span>
            <strong className="streak-num">{streak}</strong>
          </div>
          <span className="muted small">{streak === 1 ? "dia seguido" : "dias seguidos"}</span>
        </section>
        <section className="card today-grid">
          <span className="label">Hoje</span>
          {grid.length === 0 ? (
            <button className="grid-suggest" onClick={daySuggestion.onClick}>
              {daySuggestion.text}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          ) : (
            <ul className="grid-list">
              {grid.map((i) => (
                <li key={i.id}>
                  <span className="grid-time">{i.t ?? "•"}</span>
                  <span className="grid-ic"><SourceIcon source={i.source} /></span>
                  <span className="grid-title">{i.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Compromissos (hoje + futuros) — card grande com degradê, pouco texto */}
      <section className="today-commit">
        <div className="today-commit-head">
          <strong>Compromissos</strong>
          <span className="commit-count">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="commit-empty">Nada marcado. Bom momento pra agir no que move a carreira.</p>
        ) : (
          <ul className="commit-list">
            {upcoming.map((i) => (
              <li key={i.id}>
                {i.source === "task" && i.source_id ? (
                  <button
                    type="button"
                    className="commit-play"
                    onClick={() => startFocusOnTask(i.source_id!, i.title)}
                    aria-label={`Focar em ${i.title}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  </button>
                ) : (
                  <span className={"commit-ic " + i.source}><SourceIcon source={i.source} /></span>
                )}
                <span className="commit-title">
                  {i.title}
                  {i.id.startsWith("local:") && <span className="pending-badge">pendente</span>}
                </span>
                <span className="commit-time">{whenLabel(i.start_at, today)}</span>
              </li>
            ))}
          </ul>
        )}
        {/* Ação dentro do app: o "play" fica em cada tarefa (foca a tarefa).
            Sem nada à frente → sugere soltar uma ideia. */}
        <div className="commit-actions">
          {upcoming.length === 0 && (
            <button className="commit-cta" onClick={onGoBrainstorm}>
              Soltar uma ideia no Brainstorming
            </button>
          )}
          {coldPerson?.handle && (
            <a
              className="commit-cta-2"
              href={`https://wa.me/${coldPerson.handle.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              Reaquecer: falar com {coldPerson.name.split(" ")[0]}
            </a>
          )}
        </div>
      </section>

      {/* Split: contatos esfriando | última GIG */}
      <div className="today-split">
        <section className="card">
          <span className="label">Esfriando</span>
          {cooling.length === 0 ? (
            <p className="muted small" style={{ margin: "0.4rem 0 0" }}>Tudo aquecido.</p>
          ) : (
            <ul className="mini-list cold-list">
              {cooling.map((c) => (
                <li key={c.id} className="cold-row">
                  <button type="button" className="cold-tap" onClick={() => setColdOpen(c)}>
                    <span className="cold-ic"><ColdIcon kind={coldKind(c)} /></span>
                    <span className="cold-body">
                      <span className="cold-name">{c.name}</span>
                      {c.reason && <span className="cold-sub">{c.reason}</span>}
                    </span>
                  </button>
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
        <span className="motivation-spark" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 6.5L20 11l-6 2.5L12 22l-2-8.5L4 11l6-2.5z" /></svg>
        </span>
        <p>{motivation}</p>
      </section>

      <NotificationsCard />

      <button className="ghost full" onClick={() => void load()}>
        Atualizar
      </button>

      {coldOpen && <ColdSheet item={coldOpen} onClose={() => setColdOpen(null)} />}
    </div>
  );
}

/** Detalhe do item esfriando (sheet): tipo, há quanto está parado e ação. */
function ColdSheet({ item, onClose }: { item: Cold; onClose: () => void }) {
  const kind = coldKind(item);
  const digits = item.handle ? item.handle.replace(/\D/g, "") : "";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{item.name}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="cold-detail">
          <span className="cold-detail-kind">
            <ColdIcon kind={kind} /> {COLD_KIND_LABEL[kind]}
          </span>
          {item.reason && <p className="muted" style={{ margin: 0 }}>{item.reason}</p>}
          {digits ? (
            <div className="cold-detail-actions">
              <a className="primary full" style={{ marginTop: 0 }} href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
                Reaquecer no WhatsApp
              </a>
              <a className="ghost full" style={{ marginTop: 0 }} href={`tel:${digits}`}>Ligar</a>
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Abra no PC pra retomar de onde parou.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** §4: card-herói do dia de GIG — lidera com a noite (set, cachê, contato, mapa). */
function GigDayHero({ gig, onFocus }: { gig: CatalogGig; onFocus: () => void }) {
  const m = gig.meta;
  const periods =
    m.set_periods && m.set_periods.length > 0
      ? m.set_periods
      : m.start_time
        ? [{ start: m.start_time, end: m.end_time ?? "" }]
        : [];
  const tel = telLink(m.day_contact_phone);
  const wapp = waLink(m.day_contact_phone);
  // Maps no LOCAL: endereço da venue → nome da venue → título; + cidade.
  const map = mapsLink(m.address || m.venue_name || gig.title, m.city);
  const contactFirst = m.day_contact_name ? m.day_contact_name.split(" ")[0] : null;

  return (
    <section className="card gig-day">
      <span className="label">Hoje você toca</span>
      <strong className="gig-day-title">{gig.title}</strong>
      {m.city && <div className="muted gig-day-sub">{m.city}</div>}

      <dl className="gig-day-rows">
        {periods.length > 0 && (
          <div>
            <dt>Set</dt>
            <dd>{periods.map((p, i) => `${i ? " · " : ""}${p.start || "?"}${p.end ? `–${p.end}` : ""}`).join("")}</dd>
          </div>
        )}
        {typeof m.cache_amount === "number" && m.cache_amount > 0 && (
          <div>
            <dt>Cachê</dt>
            <dd>{BRL.format(m.cache_amount)}</dd>
          </div>
        )}
        {m.promoter_name && (
          <div>
            <dt>Contratante</dt>
            <dd>{m.promoter_name}</dd>
          </div>
        )}
      </dl>

      {(tel || wapp || map) && (
        <div className="gig-day-actions">
          {tel && (
            <a className="gig-act" href={tel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              Ligar{contactFirst ? ` · ${contactFirst}` : ""}
            </a>
          )}
          {wapp && (
            <a className="gig-act" href={wapp} target="_blank" rel="noreferrer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
              WhatsApp
            </a>
          )}
          {map && (
            <a className="gig-act" href={map} target="_blank" rel="noreferrer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
              Maps
            </a>
          )}
        </div>
      )}

      <button className="gig-day-focus" onClick={onFocus}>
        ▶ Ativar Modo Foco
      </button>
    </section>
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
    setMsg(r.ok ? "Resumo enviado · deve chegar em instantes." : r.reason ?? "Falhou.");
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
