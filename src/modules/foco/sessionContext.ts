import { listClasses } from "@/modules/classes/api";
import { listTracks } from "@/modules/music/api";
import { listGigs } from "@/modules/gigs/api";
import { listContent } from "@/modules/content/api";
import { listTasks } from "@/modules/tasks/api";
import { listParties } from "@/modules/parties/api";

// Vínculo de uma sessão de foco a uma entidade. Vivia dentro do
// WorkSessionWidget; saiu pra cá quando o formulário de sessão retroativa
// passou a precisar dos mesmos dois, pra não existirem duas listas de
// atividade-para-contexto que podem divergir.

export type EntityOption = { id: number; name: string };

/** Qual entidade cada atividade pode referenciar. Atividade fora do mapa não
 *  tem vínculo (ex.: Estudo, Comunicação). */
export const ACTIVITY_CONTEXT: Record<string, string> = {
  "Tempo de palco": "gig",
  // Preparação de um show: vincula a uma GIG (confirmada/proposta) e mostra o
  // checklist de preparação dela (tarefas abertas da GIG) durante o foco.
  "Preparação": "gig",
  "Criação musical": "track",
  Aulas: "class",
  "Produção de festa": "party",
  // Gestão pode referenciar uma TAREFA — aí o painel da sessão mostra o
  // checklist dela (subtasks) pra tickar enquanto foca.
  "Gestão": "task",
};

export async function loadEntityOptions(type: string): Promise<EntityOption[]> {
  switch (type) {
    case "class": {
      const rows = await listClasses();
      return rows.map((c) => ({
        id: c.id,
        name: `${c.student_name} · ${c.date}`,
      }));
    }
    case "party": {
      const rows = await listParties();
      return rows.map((p) => ({ id: p.id, name: p.title }));
    }
    case "track": {
      const rows = await listTracks();
      return rows.map((t) => ({
        id: t.id,
        name: (t.title_final && t.title_final.trim()) || t.title_working,
      }));
    }
    case "gig": {
      const rows = await listGigs();
      return rows.map((g) => ({
        id: g.id,
        name: (g.event_name && g.event_name.trim()) || g.venue_name || `GIG #${g.id}`,
      }));
    }
    case "content": {
      const rows = await listContent();
      return rows.map((c) => ({ id: c.id, name: c.title }));
    }
    case "task": {
      const rows = await listTasks();
      return rows.map((t) => ({ id: t.id, name: t.title }));
    }
    default:
      return [];
  }
}
