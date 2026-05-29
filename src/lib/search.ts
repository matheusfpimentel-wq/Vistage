import { getDb } from "./db";

export type SearchHit = {
  kind: "gig" | "contact" | "task" | "transaction" | "venue" | "fan";
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

  const [gigs, contacts, tasks, txs, venues, fans] = await Promise.all([
    db.select<
      { id: number; venue_name: string; venue_city: string | null; date: string; status: string }[]
    >(
      `SELECT id, venue_name, venue_city, date, status FROM gigs
        WHERE venue_name LIKE $1 OR venue_city LIKE $1 OR briefing LIKE $1
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
      { id: number; name: string; level: string; city: string | null }[]
    >(
      `SELECT id, name, level, city FROM fans
        WHERE name LIKE $1 OR email LIKE $1 OR phone LIKE $1 OR instagram LIKE $1
        ORDER BY name LIMIT $2`,
      [like, limit]
    ),
  ]);

  const hits: SearchHit[] = [];

  for (const g of gigs) {
    hits.push({
      kind: "gig",
      id: g.id,
      title: g.venue_name,
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
      route: "/crm",
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
  for (const f of fans) {
    hits.push({
      kind: "fan",
      id: f.id,
      title: f.name,
      subtitle: [f.level, f.city].filter(Boolean).join(" · "),
      route: "/fas",
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
  fan: "Fã",
};
