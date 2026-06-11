import { getDb } from "@/lib/db";

/** Tipo de marco na linha do tempo da carreira. */
export type MilestoneKind = "gig" | "release" | "content" | "party" | "okr" | "highlight";

export type Milestone = {
  /** chave estável para o React */
  key: string;
  /** data ISO (YYYY-MM-DD) usada para ordenar e agrupar */
  date: string;
  kind: MilestoneKind;
  title: string;
  subtitle?: string | null;
  /** rota interna pra onde o clique leva */
  to: string;
};

type GigRow = {
  id: number;
  date: string;
  event_name: string | null;
  venue_name: string;
  venue_city: string | null;
  cache_amount: number | null;
};

type TrackRow = {
  id: number;
  title_working: string;
  title_final: string | null;
  updated_at: string;
  current_stage: string;
};

type ContentRow = {
  id: number;
  title: string;
  publish_date: string | null;
  published_at: string | null;
  format: string | null;
};

type PartyRow = {
  id: number;
  title: string;
  date: string | null;
  venue_name: string | null;
};

/**
 * Agrega marcos de toda a carreira numa lista cronológica única:
 * GIGs realizadas, lançamentos musicais, conteúdos publicados e festas
 * realizadas. Read-only — pensado pro press kit e retrospectiva.
 */
export async function loadCareerTimeline(): Promise<Milestone[]> {
  const db = getDb();
  const out: Milestone[] = [];

  // ── GIGs concluídas ──────────────────────────────────────────────
  const gigs = await db.select<GigRow[]>(
    `SELECT id, date, event_name, venue_name, venue_city, cache_amount
       FROM gigs WHERE status = 'Concluída' AND date IS NOT NULL`
  );
  for (const g of gigs) {
    const name = g.event_name?.trim() || g.venue_name;
    const loc = [g.venue_name !== name ? g.venue_name : null, g.venue_city]
      .filter(Boolean)
      .join(" · ");
    out.push({
      key: `gig-${g.id}`,
      date: g.date,
      kind: "gig",
      title: name,
      subtitle: loc || null,
      to: `/gigs?open=${g.id}`,
    });
  }

  // ── Lançamentos musicais (track que chegou em Lançamento+) ────────
  const tracks = await db.select<TrackRow[]>(
    `SELECT id, title_working, title_final, updated_at, current_stage
       FROM tracks
      WHERE current_stage IN ('Lançamento', 'Pós-lançamento')`
  );
  for (const t of tracks) {
    out.push({
      key: `track-${t.id}`,
      date: (t.updated_at || "").slice(0, 10),
      kind: "release",
      title: t.title_final?.trim() || t.title_working,
      subtitle: "Lançamento musical",
      to: `/musica?open=${t.id}`,
    });
  }

  // ── Conteúdos publicados ──────────────────────────────────────────
  const contents = await db.select<ContentRow[]>(
    `SELECT id, title, publish_date, published_at, format
       FROM content WHERE status = 'Publicado'`
  );
  for (const c of contents) {
    const date = (c.published_at || c.publish_date || "").slice(0, 10);
    if (!date) continue;
    out.push({
      key: `content-${c.id}`,
      date,
      kind: "content",
      title: c.title,
      subtitle: c.format ? `Conteúdo · ${c.format}` : "Conteúdo publicado",
      to: `/conteudo?open=${c.id}`,
    });
  }

  // ── Festas realizadas ─────────────────────────────────────────────
  const parties = await db.select<PartyRow[]>(
    `SELECT id, title, date, venue_name
       FROM parties WHERE status = 'Realizada' AND date IS NOT NULL`
  );
  for (const p of parties) {
    out.push({
      key: `party-${p.id}`,
      date: (p.date || "").slice(0, 10),
      kind: "party",
      title: p.title,
      subtitle: p.venue_name ? `Festa · ${p.venue_name}` : "Festa realizada",
      to: `/festas?open=${p.id}`,
    });
  }

  // ── Highlights cumulativos ────────────────────────────────────────
  const highlights = await db.select<{ id: number; title: string; date: string; body: string | null }[]>(
    `SELECT id, title, date, body FROM highlights WHERE date IS NOT NULL`
  );
  for (const h of highlights) {
    out.push({
      key: `highlight-${h.id}`,
      date: h.date.slice(0, 10),
      kind: "highlight",
      title: h.title,
      subtitle: h.body ? h.body.slice(0, 60) + (h.body.length > 60 ? "…" : "") : null,
      to: "/foco",
    });
  }

  // Mais recente primeiro.
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out.filter((m) => m.date);
}
