import { getDb } from "./db";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { getHiddenModules } from "./moduleVisibility";

export type SearchHit = {
  kind:
    | "gig"
    | "contact"
    | "task"
    | "transaction"
    | "venue"
    | "supplier"
    | "fan"
    | "content"
    | "idea"
    | "student"
    | "track"
    | "party"
    | "library_track"
    | "note";
  id: number;
  title: string;
  subtitle: string;
  /** Rota interna pra onde levar o usuário. */
  route: string;
};

/**
 * Busca textual rápida em GIGs, Contatos, Tarefas e Transações.
 * Os módulos têm filtros e detalhes próprios; aqui apenas listamos
 * os matches mais relevantes pra navegação rápida.
 */
export async function globalSearch(query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const db = getDb();
  const like = `%${q}%`;
  // Módulos ocultos (Perfil) não contribuem resultados — pula a query inteira.
  const hidden = getHiddenModules();

  const [gigs, contacts, tasks, txs, venues, suppliers, fans, contents, ideas, students, tracks, parties, libraryTracks, notes] = await Promise.all([
    hidden.has("/gigs") ? Promise.resolve([]) : db.select<
      {
        id: number;
        venue_name: string;
        event_name: string | null;
        recurring_event_name: string | null;
        venue_city: string | null;
        date: string;
        status: string;
      }[]
    >(
      `SELECT id, venue_name, event_name, recurring_event_name, venue_city, date, status FROM gigs
        WHERE venue_name LIKE $1 OR venue_city LIKE $1 OR briefing LIKE $1
          OR event_name LIKE $1 OR recurring_event_name LIKE $1
        ORDER BY date DESC LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; name: string; city: string | null; email: string | null }[]
    >(
      `SELECT id, name, city, email FROM contacts
        WHERE name LIKE $1 OR email LIKE $1 OR phone LIKE $1 OR instagram LIKE $1
        ORDER BY name LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; title: string; status: string; due_date: string | null }[]
    >(
      `SELECT id, title, status, due_date FROM tasks
        WHERE title LIKE $1 OR description LIKE $1
        ORDER BY due_date IS NULL, due_date ASC LIMIT $2`,
      [like, limit]
    ),
    db.select<
      {
        id: number;
        description: string | null;
        amount: number;
        kind: string;
        date: string;
      }[]
    >(
      `SELECT t.id, t.description, t.amount, t.kind, t.date
         FROM finance_transactions t
         LEFT JOIN finance_categories c ON c.id = t.category_id
        WHERE t.description LIKE $1 OR c.name LIKE $1
        ORDER BY t.date DESC LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; name: string; city: string | null; capacity: number | null }[]
    >(
      `SELECT id, name, city, capacity FROM venues
        WHERE name LIKE $1 OR city LIKE $1 OR owner_name LIKE $1
        ORDER BY name LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; name: string; category: string | null; city: string | null }[]
    >(
      `SELECT id, name, category, city FROM suppliers
        WHERE name LIKE $1 OR contact_name LIKE $1 OR category LIKE $1 OR notes LIKE $1
        ORDER BY name LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; name: string; level: string; city: string | null }[]
    >(
      `SELECT id, name, level, city FROM fans
        WHERE name LIKE $1 OR email LIKE $1 OR phone LIKE $1 OR instagram LIKE $1
        ORDER BY name LIMIT $2`,
      [like, limit]
    ),
    hidden.has("/conteudo") ? Promise.resolve([]) : db.select<
      { id: number; title: string; status: string; format: string | null }[]
    >(
      `SELECT id, title, status, format FROM content
        WHERE title LIKE $1 OR purpose LIKE $1 OR script LIKE $1
        ORDER BY publish_date DESC LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; title: string; category: string | null; heat: number }[]
    >(
      `SELECT id, title, category, heat FROM ideas
        WHERE title LIKE $1 OR body LIKE $1
        ORDER BY heat DESC, updated_at DESC LIMIT $2`,
      [like, limit]
    ),
    hidden.has("/aulas") ? Promise.resolve([]) : db.select<
      { id: number; name: string; city: string | null }[]
    >(
      `SELECT id, name, city FROM students
        WHERE name LIKE $1 OR email LIKE $1 OR phone LIKE $1 OR instagram LIKE $1
        ORDER BY name LIMIT $2`,
      [like, limit]
    ),
    hidden.has("/musica") ? Promise.resolve([]) : db.select<
      { id: number; title: string; current_stage: string; kind: string }[]
    >(
      `SELECT id, COALESCE(NULLIF(title_final, ''), title_working) AS title,
              current_stage, kind FROM tracks
        WHERE title_working LIKE $1 OR title_final LIKE $1
           OR genre_primary LIKE $1 OR concept_narrative LIKE $1
        ORDER BY updated_at DESC LIMIT $2`,
      [like, limit]
    ),
    hidden.has("/festas") ? Promise.resolve([]) : db.select<
      { id: number; title: string; status: string; date: string | null }[]
    >(
      `SELECT id, title, status, date FROM parties
        WHERE title LIKE $1 OR venue_name LIKE $1 OR description LIKE $1
        ORDER BY date IS NULL, date DESC LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; title: string | null; artist: string | null }[]
    >(
      `SELECT id, title, artist FROM library_tracks
        WHERE archived_at IS NULL AND (title LIKE $1 OR artist LIKE $1 OR genre LIKE $1 OR comments LIKE $1)
        ORDER BY artist, title LIMIT $2`,
      [like, limit]
    ),
    db.select<
      { id: number; title: string }[]
    >(
      `SELECT id, title FROM notes
        WHERE title LIKE $1 OR body LIKE $1
        ORDER BY updated_at DESC LIMIT $2`,
      [like, limit]
    ),
  ]);

  const hits: SearchHit[] = [];

  for (const g of gigs) {
    hits.push({
      kind: "gig",
      id: g.id,
      title: gigDisplayName(g),
      subtitle: `${g.date}${g.venue_city ? ` · ${g.venue_city}` : ""} · ${g.status}`,
      route: "/gigs",
    });
  }
  for (const c of contacts) {
    hits.push({
      kind: "contact",
      id: c.id,
      title: c.name,
      subtitle: [c.city, c.email].filter(Boolean).join(" · ") || "Contato",
      route: "/pessoas",
    });
  }
  for (const t of tasks) {
    hits.push({
      kind: "task",
      id: t.id,
      title: t.title,
      subtitle: `${t.status}${t.due_date ? ` · vence ${t.due_date}` : ""}`,
      route: "/tarefas",
    });
  }
  for (const tx of txs) {
    const sign = tx.kind === "income" ? "+" : "−";
    const valor = tx.amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    hits.push({
      kind: "transaction",
      id: tx.id,
      title: tx.description ?? "(sem descrição)",
      subtitle: `${tx.date} · ${sign} ${valor}`,
      route: "/financeiro",
    });
  }
  for (const v of venues) {
    hits.push({
      kind: "venue",
      id: v.id,
      title: v.name,
      subtitle:
        [v.city, v.capacity ? `cap. ${v.capacity}` : null]
          .filter(Boolean)
          .join(" · ") || "Venue",
      route: "/venues",
    });
  }
  for (const s of suppliers) {
    hits.push({
      kind: "supplier",
      id: s.id,
      title: s.name,
      subtitle: [s.category, s.city].filter(Boolean).join(" · ") || "Fornecedor",
      route: "/pessoas",
    });
  }
  for (const f of fans) {
    hits.push({
      kind: "fan",
      id: f.id,
      title: f.name,
      subtitle: [f.level, f.city].filter(Boolean).join(" · "),
      route: "/fas",
    });
  }
  for (const c of contents) {
    hits.push({
      kind: "content",
      id: c.id,
      title: c.title,
      subtitle: [c.status, c.format].filter(Boolean).join(" · "),
      route: "/conteudo",
    });
  }
  for (const i of ideas) {
    const heatLabel = i.heat === 3 ? "Quente" : i.heat === 2 ? "Morna" : "Fria";
    hits.push({
      kind: "idea",
      id: i.id,
      title: i.title,
      subtitle: [heatLabel, i.category].filter(Boolean).join(" · "),
      route: "/ideias",
    });
  }
  for (const s of students) {
    hits.push({
      kind: "student",
      id: s.id,
      title: s.name,
      subtitle: s.city ?? "Aluno",
      route: "/aulas",
    });
  }
  for (const t of tracks) {
    hits.push({
      kind: "track",
      id: t.id,
      title: t.title,
      subtitle: [t.current_stage, t.kind].filter(Boolean).join(" · "),
      route: "/musica",
    });
  }
  for (const p of parties) {
    hits.push({
      kind: "party",
      id: p.id,
      title: p.title,
      subtitle: [p.status, p.date].filter(Boolean).join(" · "),
      route: "/festas",
    });
  }
  for (const lt of libraryTracks) {
    hits.push({
      kind: "library_track",
      id: lt.id,
      title: lt.title || lt.artist || "(sem título)",
      subtitle: lt.artist ?? "Biblioteca",
      route: "/biblioteca",
    });
  }
  for (const n of notes) {
    hits.push({
      kind: "note",
      id: n.id,
      title: n.title || "(sem título)",
      subtitle: "Nota",
      route: "/biblioteca",
    });
  }
  return hits;
}

export const KIND_LABEL: Record<SearchHit["kind"], string> = {
  gig: "GIG",
  contact: "Contato",
  task: "Tarefa",
  transaction: "Financeiro",
  venue: "Venue",
  supplier: "Fornecedor",
  fan: "Fã",
  content: "Conteúdo",
  idea: "Ideia",
  student: "Aluno",
  track: "Track",
  party: "Festa",
  library_track: "Música",
  note: "Nota",
};
