import {
  Building2,
  CalendarRange,
  CheckSquare,
  Film,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Lightbulb,
  Music,
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

export type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  fixed?: boolean;
};

export const DEFAULT_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, fixed: true },
  { to: "/gigs", label: "GIGs", icon: CalendarRange },
  { to: "/venues", label: "Venues", icon: Building2 },
  { to: "/crm", label: "CRM", icon: Users },
  { to: "/fornecedores", label: "Fornecedores", icon: Store },
  { to: "/fas", label: "Clube de fãs", icon: Heart },
  { to: "/aulas", label: "Aulas", icon: GraduationCap },
  { to: "/musica", label: "Produção Musical", icon: Music },
  { to: "/festas", label: "Produção de Festas", icon: PartyPopper },
  { to: "/conteudo", label: "Conteúdo", icon: Film },
  { to: "/ideias", label: "Ideias & Insights", icon: Lightbulb },
  { to: "/foco", label: "Energia & Foco", icon: Zap },
  { to: "/objetivos", label: "OKRs", icon: Target },
  { to: "/identidade", label: "Identidade", icon: Sparkles },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/configuracoes", label: "Configurações", icon: Settings, fixed: true },
];

const SETTINGS_KEY = "sidebar_order";

/** Disparado quando a ordem do menu muda, pra sidebar e settings ficarem em sincronia. */
export const NAV_ORDER_CHANGED = "vistage:nav-order-changed";

export async function loadNavOrder(): Promise<string[] | null> {
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
export function applyNavOrder(items: NavItem[], order: string[]): NavItem[] {
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
