// "O que precisa de você" — reaproveita a MESMA lógica de alertas do sininho
// (computeAlerts + as 3 consultas de NotificationBell), filtrando por grupo
// temático pelo destino (`to`) de cada item.
import { loadWeekStats } from "@/modules/revisao/api";
import { computeAlerts, type AlertItem } from "@/modules/revisao/alerts";
import {
  loadExtraStats,
  loadOverdueReceivableAlerts,
  loadRelationshipAlerts,
  loadStaleGigStatusAlerts,
} from "@/components/shared/NotificationBell";

// rota de destino → grupo temático da dash
const ROUTE_GROUP: Record<string, string> = {
  "/pessoas": "Relacionamento",
  "/crm": "Relacionamento",
  "/fornecedores": "Relacionamento",
  "/fas": "Relacionamento",
  "/gigs": "Criação",
  "/musica": "Criação",
  "/festas": "Criação",
  "/conteudo": "Criação",
  "/aulas": "Criação",
  "/tarefas": "Produtividade",
  "/ideias": "Produtividade",
  "/objetivos": "Produtividade",
  "/financeiro": "Gestão",
};

export function alertGroup(to: string): string | undefined {
  return ROUTE_GROUP[to.split("?")[0]];
}

/** Todos os itens acionáveis (mesma fonte do sininho). */
export async function loadActionItems(): Promise<AlertItem[]> {
  const [stats, extra, rel, staleGigs, overdue] = await Promise.all([
    loadWeekStats(),
    loadExtraStats(),
    loadRelationshipAlerts(),
    loadStaleGigStatusAlerts(),
    loadOverdueReceivableAlerts(),
  ]);
  return [...computeAlerts(stats, extra), ...rel, ...staleGigs, ...overdue];
}

/** Itens acionáveis de um grupo temático, críticos primeiro. */
export async function loadActionItemsForGroup(group: string): Promise<AlertItem[]> {
  const all = await loadActionItems();
  return all
    .filter((a) => alertGroup(a.to) === group)
    .sort((a, b) => Number(b.critical) - Number(a.critical));
}
