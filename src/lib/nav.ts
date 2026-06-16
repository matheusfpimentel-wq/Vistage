import {
  Award,
  Briefcase,
  Building2,
  CalendarRange,
  CheckSquare,
  Film,
  Gauge,
  GraduationCap,
  Handshake,
  Heart,
  LayoutDashboard,
  Lightbulb,
  MessagesSquare,
  Music,
  Palette,
  PartyPopper,
  Settings,
  Sparkles,
  Store,
  Target,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { getDb } from "@/lib/db";

export type NavGroup = "Operação" | "Relacionamento" | "Criação" | "Gestão";

/** Ordem em que os grupos aparecem na sidebar. */
export const NAV_GROUP_ORDER: NavGroup[] = [
  "Operação",
  "Relacionamento",
  "Criação",
  "Gestão",
];

/** Metadados de cada grupo — usados no cabeçalho clicável da sidebar e na dash própria do grupo. */
export const NAV_GROUP_META: Record<
  NavGroup,
  { to: string; icon: React.ElementType; tagline: string }
> = {
  "Operação": { to: "/operacao", icon: Briefcase, tagline: "Execução do dia a dia" },
  "Relacionamento": { to: "/relacionamento", icon: Handshake, tagline: "Pessoas, parcerias e fãs" },
  "Criação": { to: "/criacao", icon: Palette, tagline: "Pipeline criativo" },
  "Gestão": { to: "/gestao", icon: Gauge, tagline: "Números e direção do projeto" },
};

export type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  fixed?: boolean;
  /** Grupo de navegação; itens fixos (Dashboard/Alertas/Configurações) não têm. */
  group?: NavGroup;
};

export const DEFAULT_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, fixed: true },

  { to: "/gigs", label: "GIGs", icon: CalendarRange, group: "Operação" },
  { to: "/festas", label: "Produção de Festas", icon: PartyPopper, group: "Operação" },
  { to: "/aulas", label: "Aulas", icon: GraduationCap, group: "Operação" },
  { to: "/musica", label: "Produção Musical", icon: Music, group: "Operação" },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare, group: "Gestão" },
  { to: "/reunioes", label: "Reuniões", icon: MessagesSquare, group: "Gestão" },

  { to: "/crm", label: "CRM", icon: Users, group: "Relacionamento" },
  { to: "/venues", label: "Venues", icon: Building2, group: "Relacionamento" },
  { to: "/fornecedores", label: "Fornecedores", icon: Store, group: "Relacionamento" },
  { to: "/fas", label: "Clube de fãs", icon: Heart, group: "Relacionamento" },

  { to: "/conteudo", label: "Conteúdo", icon: Film, group: "Criação" },
  { to: "/ideias", label: "Ideias & Insights", icon: Lightbulb, group: "Criação" },
  { to: "/foco", label: "Energia & Foco", icon: Zap, group: "Criação" },

  { to: "/financeiro", label: "Financeiro", icon: Wallet, group: "Gestão" },
  { to: "/objetivos", label: "OKRs", icon: Target, group: "Gestão" },
  { to: "/identidade", label: "Identidade", icon: Sparkles, group: "Gestão" },

  { to: "/carreira", label: "Carreira em Números", icon: Award, group: "Gestão" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, fixed: true },
];

const SETTINGS_KEY = "sidebar_order";

/** Disparado quando a ordem do menu muda, pra sidebar e settings ficarem em sincronia. */
export const NAV_ORDER_CHANGED = "vistage:nav-order-changed";

async function loadNavOrder(): Promise<string[] | null> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_KEY]
    );
    if (!rows[0]) return null;
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveNavOrder(order: string[]): Promise<void> {
  try {
    const db = getDb();
    await db.execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [SETTINGS_KEY, JSON.stringify(order)]
    );
    window.dispatchEvent(new CustomEvent(NAV_ORDER_CHANGED));
  } catch {
    // non-critical
  }
}

/** Aplica a ordem salva, mantendo Dashboard fixo no topo e Configurações fixo no fim. */
function applyNavOrder(items: NavItem[], order: string[]): NavItem[] {
  const map = new Map(items.map((i) => [i.to, i]));
  const fixed_head = items.filter((i) => i.fixed && i.to === "/");
  const fixed_tail = items.filter((i) => i.fixed && i.to !== "/");
  const reorderable = order
    .map((to) => map.get(to))
    .filter((i): i is NavItem => !!i && !i.fixed);
  const missing = items.filter((i) => !i.fixed && !order.includes(i.to));
  return [...fixed_head, ...reorderable, ...missing, ...fixed_tail];
}

/** Carrega a ordem efetiva já aplicada ao DEFAULT_NAV. */
export async function loadOrderedNav(): Promise<NavItem[]> {
  const order = await loadNavOrder();
  return order ? applyNavOrder(DEFAULT_NAV, order) : DEFAULT_NAV;
}

/** Módulos que pertencem a um grupo, na ordem salva (ou padrão). */
export function modulesInGroup(nav: NavItem[], group: NavGroup): NavItem[] {
  return nav.filter((i) => i.group === group);
}
