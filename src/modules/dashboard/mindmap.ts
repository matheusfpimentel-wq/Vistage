import { getDb } from "@/lib/db";

/**
 * Mapa mental — teia de conhecimento que liga os módulos pelos vínculos
 * adensados (FKs cruzadas). Cada nó é uma entidade real; cada aresta é um
 * vínculo entre módulos. Só entram no grafo nós que participam de ao menos
 * um vínculo — um nó solto não diz nada numa teia de relações.
 */

export type MindNodeType =
  | "gig"
  | "party"
  | "student"
  | "track"
  | "project"
  | "content"
  | "idea"
  | "contact"
  | "venue"
  | "supplier"
  | "fan";

export type MindNode = {
  id: string; // `${type}:${dbId}`
  type: MindNodeType;
  label: string;
  /** rota para navegar ao clicar */
  route: string;
};

export type MindEdge = {
  source: string;
  target: string;
  /** rótulo legível do tipo de vínculo */
  kind: string;
};

export type MindGraph = { nodes: MindNode[]; edges: MindEdge[] };

/** Metadados de apresentação por tipo de nó (cor + rótulo do módulo). */
export const MIND_TYPE_META: Record<
  MindNodeType,
  { label: string; color: string; route: string }
> = {
  gig:     { label: "GIG",             color: "#a78bfa", route: "/gigs" },       // violeta
  party:   { label: "Festa",           color: "#f472b6", route: "/festas" },      // rosa
  student: { label: "Aluno",           color: "#34d399", route: "/aulas" },       // verde-esmeralda
  track:   { label: "Faixa",           color: "#38bdf8", route: "/musica" },      // azul-céu
  project: { label: "Projeto musical", color: "#818cf8", route: "/musica" },      // índigo-claro
  content: { label: "Conteúdo",        color: "#fbbf24", route: "/conteudo" },    // âmbar
  idea:    { label: "Ideia",           color: "#a3e635", route: "/ideias" },      // lima
  contact: { label: "Contato",         color: "#4ade80", route: "/crm" },         // verde
  venue:   { label: "Venue",           color: "#22d3ee", route: "/venues" },      // ciano
  supplier:{ label: "Fornecedor",      color: "#fb923c", route: "/fornecedores" },// laranja
  fan:     { label: "Fã",             color: "#f87171", route: "/fas" },          // vermelho-claro
};

const nid = (type: MindNodeType, id: number) => `${type}:${id}`;

export async function buildMindGraph(): Promise<MindGraph> {
  const db = getDb();

  // ── carrega entidades candidatas (id + rótulo) ────────────────────────────
  const [
    gigs,
    parties,
    students,
    tracks,
    projects,
    contents,
    ideas,
    contacts,
    venues,
    suppliers,
    fans,
  ] = await Promise.all([
    db.select<{ id: number; label: string; venue_id: number | null; promoter_contact_id: number | null }[]>(
      `SELECT id, COALESCE(NULLIF(event_name,''), venue_name, 'GIG #'||id) AS label, venue_id, promoter_contact_id FROM gigs`
    ),
    db.select<{ id: number; label: string; gig_id: number | null }[]>(
      `SELECT id, COALESCE(NULLIF(title,''), 'Festa #'||id) AS label, gig_id FROM parties`
    ),
    db.select<{ id: number; label: string; contact_id: number | null }[]>(
      `SELECT id, COALESCE(NULLIF(name,''), 'Aluno #'||id) AS label, contact_id FROM students`
    ),
    db.select<{ id: number; label: string; project_id: number | null; related_track_id: number | null }[]>(
      `SELECT id, COALESCE(NULLIF(title_final,''), NULLIF(title_working,''), 'Faixa #'||id) AS label, project_id, related_track_id FROM tracks`
    ),
    db.select<{ id: number; label: string }[]>(
      `SELECT id, COALESCE(NULLIF(title,''), 'Projeto #'||id) AS label FROM music_projects`
    ),
    db.select<{ id: number; label: string; track_id: number | null; promotes_type: string | null; promotes_id: number | null }[]>(
      `SELECT id, COALESCE(NULLIF(title,''), 'Conteúdo #'||id) AS label, track_id, promotes_type, promotes_id FROM content`
    ),
    db.select<{ id: number; label: string; related_idea_id: number | null }[]>(
      `SELECT id, COALESCE(NULLIF(title,''), 'Ideia #'||id) AS label, related_idea_id FROM ideas`
    ),
    db.select<{ id: number; label: string }[]>(
      `SELECT id, COALESCE(NULLIF(name,''), 'Contato #'||id) AS label FROM contacts`
    ),
    db.select<{ id: number; label: string }[]>(
      `SELECT id, COALESCE(NULLIF(name,''), 'Venue #'||id) AS label FROM venues`
    ),
    db.select<{ id: number; label: string }[]>(
      `SELECT id, COALESCE(NULLIF(name,''), 'Fornecedor #'||id) AS label FROM suppliers`
    ),
    db.select<{ id: number; label: string }[]>(
      `SELECT id, COALESCE(NULLIF(name,''), 'Fã #'||id) AS label FROM fans`
    ),
  ]);

  const gigFans = await db.select<{ gig_id: number; fan_id: number }[]>(
    `SELECT gig_id, fan_id FROM gig_fans`
  );
  const partySuppliers = await db.select<{ party_id: number; supplier_id: number }[]>(
    `SELECT DISTINCT party_id, supplier_id FROM party_budget_items WHERE supplier_id IS NOT NULL`
  );

  // ── catálogo de nós possíveis (ainda não filtrado) ────────────────────────
  const catalog = new Map<string, MindNode>();
  const add = (type: MindNodeType, id: number, label: string) => {
    const key = nid(type, id);
    if (!catalog.has(key)) {
      catalog.set(key, { id: key, type, label, route: MIND_TYPE_META[type].route });
    }
  };
  gigs.forEach((g) => add("gig", g.id, g.label));
  parties.forEach((p) => add("party", p.id, p.label));
  students.forEach((s) => add("student", s.id, s.label));
  tracks.forEach((t) => add("track", t.id, t.label));
  projects.forEach((p) => add("project", p.id, p.label));
  contents.forEach((c) => add("content", c.id, c.label));
  ideas.forEach((i) => add("idea", i.id, i.label));
  contacts.forEach((c) => add("contact", c.id, c.label));
  venues.forEach((v) => add("venue", v.id, v.label));
  suppliers.forEach((s) => add("supplier", s.id, s.label));
  fans.forEach((f) => add("fan", f.id, f.label));

  // ── arestas (vínculos) — só criadas quando ambos os nós existem ───────────
  const edges: MindEdge[] = [];
  const link = (a: string, b: string, kind: string) => {
    if (catalog.has(a) && catalog.has(b)) edges.push({ source: a, target: b, kind });
  };

  // vínculos adensados
  students.forEach((s) => {
    if (s.contact_id != null) link(nid("student", s.id), nid("contact", s.contact_id), "aluno é contato");
  });
  contents.forEach((c) => {
    if (c.track_id != null) link(nid("content", c.id), nid("track", c.track_id), "conteúdo da faixa");
    if (c.promotes_type === "gig" && c.promotes_id != null)
      link(nid("content", c.id), nid("gig", c.promotes_id), "promove GIG");
    if (c.promotes_type === "party" && c.promotes_id != null)
      link(nid("content", c.id), nid("party", c.promotes_id), "promove festa");
  });
  parties.forEach((p) => {
    if (p.gig_id != null) link(nid("party", p.id), nid("gig", p.gig_id), "festa da GIG");
  });
  gigFans.forEach((gf) => link(nid("gig", gf.gig_id), nid("fan", gf.fan_id), "fã presente"));
  partySuppliers.forEach((ps) =>
    link(nid("party", ps.party_id), nid("supplier", ps.supplier_id), "fornecedor")
  );
  tracks.forEach((t) => {
    if (t.related_track_id != null) link(nid("track", t.id), nid("track", t.related_track_id), "faixa relacionada");
    if (t.project_id != null) link(nid("track", t.id), nid("project", t.project_id), "faixa do projeto");
  });
  ideas.forEach((i) => {
    if (i.related_idea_id != null) link(nid("idea", i.id), nid("idea", i.related_idea_id), "ideia relacionada");
  });

  // vínculos pré-existentes que enriquecem a teia
  gigs.forEach((g) => {
    if (g.venue_id != null) link(nid("gig", g.id), nid("venue", g.venue_id), "na venue");
    if (g.promoter_contact_id != null) link(nid("gig", g.id), nid("contact", g.promoter_contact_id), "contratante");
  });

  // ── mantém só nós que participam de ao menos um vínculo ───────────────────
  const used = new Set<string>();
  edges.forEach((e) => {
    used.add(e.source);
    used.add(e.target);
  });
  const nodes = [...catalog.values()].filter((n) => used.has(n.id));

  return { nodes, edges };
}
