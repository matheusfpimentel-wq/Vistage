// Vínculo polimórfico reutilizável (entity_type + entity_id).
//
// Fonte única de verdade para "que entidades existem, como se chamam e como
// listá-las" — usada pela Biblioteca de Documentos (associar um arquivo do Drive
// a qualquer entidade) e disponível para outros pontos que precisem de um
// seletor Tipo → Entidade. Os imports são dinâmicos (mesmo padrão do LinkPicker
// das tarefas) para não puxar todos os módulos no bundle inicial.

export const ENTITY_LINK_TYPES = [
  "gig",
  "party",
  "contact",
  "track",
  "venue",
  "supplier",
  "meeting",
  "content",
  "task",
  "class",
  "student",
  "fan",
  "idea",
] as const;

export type EntityLinkType = (typeof ENTITY_LINK_TYPES)[number];

export const ENTITY_LINK_LABELS: Record<EntityLinkType, string> = {
  gig: "GIG",
  party: "Festa",
  contact: "Contato",
  track: "Track Musical",
  venue: "Venue",
  supplier: "Fornecedor",
  meeting: "Reunião",
  content: "Conteúdo",
  task: "Tarefa",
  class: "Aula",
  student: "Aluno",
  fan: "Fã",
  idea: "Ideia",
};

export type EntityOption = { id: number; label: string };

export function isEntityLinkType(v: string): v is EntityLinkType {
  return (ENTITY_LINK_TYPES as readonly string[]).includes(v);
}

/** Lista as entidades de um tipo como opções {id, label} para o seletor. */
export async function loadEntityOptions(type: EntityLinkType): Promise<EntityOption[]> {
  switch (type) {
    case "gig": {
      const { listGigs } = await import("@/modules/gigs/api");
      const { gigDisplayName } = await import("@/modules/gigs/displayName");
      return (await listGigs()).map((g) => ({ id: g.id, label: `${gigDisplayName(g)} · ${g.date}` }));
    }
    case "party": {
      const { listParties } = await import("@/modules/parties/api");
      return (await listParties()).map((p) => ({ id: p.id, label: p.title }));
    }
    case "contact": {
      const { listContacts } = await import("@/modules/crm/api");
      return (await listContacts()).map((c) => ({ id: c.id, label: c.name }));
    }
    case "track": {
      const { listTracks } = await import("@/modules/music/api");
      return (await listTracks()).map((t) => ({ id: t.id, label: t.title_final ?? t.title_working }));
    }
    case "venue": {
      const { listVenues } = await import("@/modules/venues/api");
      return (await listVenues()).map((v) => ({ id: v.id, label: v.name }));
    }
    case "supplier": {
      const { listSuppliers } = await import("@/modules/suppliers/api");
      return (await listSuppliers()).map((s) => ({ id: s.id, label: s.name }));
    }
    case "meeting": {
      const { listMeetings } = await import("@/modules/meetings/api");
      return (await listMeetings()).map((m) => ({ id: m.id, label: m.title }));
    }
    case "content": {
      const { listContent } = await import("@/modules/content/api");
      return (await listContent()).map((c) => ({ id: c.id, label: c.title }));
    }
    case "task": {
      const { listTasks } = await import("@/modules/tasks/api");
      return (await listTasks()).map((t) => ({ id: t.id, label: t.title }));
    }
    case "class": {
      const { listClasses } = await import("@/modules/classes/api");
      return (await listClasses()).map((c) => ({ id: c.id, label: c.title?.trim() || `Aula · ${c.student_name}` }));
    }
    case "student": {
      const { listStudents } = await import("@/modules/classes/api");
      return (await listStudents()).map((s) => ({ id: s.id, label: s.name }));
    }
    case "fan": {
      const { listFans } = await import("@/modules/fans/api");
      return (await listFans()).map((f) => ({ id: f.id, label: f.name }));
    }
    case "idea": {
      const { listIdeas } = await import("@/modules/ideas/api");
      return (await listIdeas()).map((i) => ({ id: i.id, label: i.title }));
    }
  }
}

/** Resolve o rótulo de UMA entidade (fallback para vínculos antigos sem label
 *  cacheado). Carrega a lista do tipo e busca pelo id. */
export async function resolveEntityLabel(type: EntityLinkType, id: number): Promise<string> {
  try {
    const opts = await loadEntityOptions(type);
    return opts.find((o) => o.id === id)?.label ?? `${ENTITY_LINK_LABELS[type]} #${id}`;
  } catch {
    return `${ENTITY_LINK_LABELS[type]} #${id}`;
  }
}
