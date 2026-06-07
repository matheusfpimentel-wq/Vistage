import { getDb } from "./db";

/** Itens que aparecem em "Continuar de onde parei". */
export type RecentKind =
  | "gig"
  | "track"
  | "party"
  | "content"
  | "idea"
  | "contact"
  | "task"
  | "venue"
  | "supplier"
  | "class";

export type RecentItem = {
  kind: RecentKind;
  id: number;
  title: string;
  updated_at: string;
  route: string;
};

const ROUTE: Record<RecentKind, string> = {
  gig: "/gigs",
  track: "/musica",
  party: "/festas",
  content: "/conteudo",
  idea: "/ideias",
  contact: "/crm",
  task: "/tarefas",
  venue: "/venues",
  supplier: "/fornecedores",
  class: "/aulas",
};

export const RECENT_KIND_LABEL: Record<RecentKind, string> = {
  gig: "GIG",
  track: "Track",
  party: "Festa",
  content: "Conteúdo",
  idea: "Ideia",
  contact: "Contato",
  task: "Tarefa",
  venue: "Venue",
  supplier: "Fornecedor",
  class: "Aula",
};

/**
 * Últimos itens editados em todo o app, ordenados por updated_at.
 * Um único UNION ALL evita várias idas ao banco.
 */
export async function loadRecentlyEdited(limit = 6): Promise<RecentItem[]> {
  const db = getDb();
  const rows = await db.select<
    { kind: RecentKind; id: number; title: string | null; updated_at: string }[]
  >(
    `SELECT * FROM (
       SELECT 'gig' AS kind, id, COALESCE(NULLIF(event_name,''), venue_name) AS title, updated_at FROM gigs
       UNION ALL SELECT 'track', id, COALESCE(NULLIF(title_final,''), title_working), updated_at FROM tracks
       UNION ALL SELECT 'party', id, title, updated_at FROM parties
       UNION ALL SELECT 'content', id, title, updated_at FROM content
       UNION ALL SELECT 'idea', id, title, updated_at FROM ideas
       UNION ALL SELECT 'contact', id, name, updated_at FROM contacts
       UNION ALL SELECT 'task', id, title, updated_at FROM tasks
       UNION ALL SELECT 'venue', id, name, updated_at FROM venues
       UNION ALL SELECT 'supplier', id, name, updated_at FROM suppliers
       UNION ALL SELECT 'class', c.id, COALESCE(NULLIF(c.subject,''), s.name), c.updated_at
         FROM classes c LEFT JOIN students s ON s.id = c.student_id
     )
     WHERE updated_at IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    title: r.title?.trim() || "(sem título)",
    route: ROUTE[r.kind],
  }));
}
