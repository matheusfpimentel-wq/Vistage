import {
  Building2,
  CalendarRange,
  CheckSquare,
  Film,
  Gauge,
  GraduationCap,
  Handshake,
  Heart,
  LayoutDashboard,
  Library,
  Lightbulb,
  MessagesSquare,
  Music,
  Palette,
  PartyPopper,
  Sparkles,
  Target,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { getDb } from "@/lib/db";

export type NavGroup = "Criação" | "Relacionamento" | "Produtividade" | "Administração";

/** Ordem em que os grupos aparecem na sidebar. */
export const NAV_GROUP_ORDER: NavGroup[] = [
  "Criação",
  "Relacionamento",
  "Produtividade",
  "Administração",
];

/** Metadados de cada grupo — usados no cabeçalho clicável da sidebar e na dash própria do grupo. */
export const NAV_GROUP_META: Record<
  NavGroup,
  { to: string; icon: React.ElementType; tagline: string }
> = {
  "Criação": { to: "/criacao", icon: Palette, tagline: "Produção, conteúdo e agenda" },
  "Relacionamento": { to: "/relacionamento", icon: Handshake, tagline: "Pessoas, parcerias e fãs" },
  "Produtividade": { to: "/gestao", icon: Gauge, tagline: "Foco, tarefas e objetivos" },
  // Grupo sem hub próprio: o cabeçalho leva direto ao Financeiro.
  "Administração": { to: "/financeiro", icon: Wallet, tagline: "Finanças e identidade" },
};

export type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  fixed?: boolean;
  /** Grupo de navegação; itens fixos (Dashboard/Configurações) não têm. */
  group?: NavGroup;
};

export const DEFAULT_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, fixed: true },

  { to: "/gigs", label: "GIGs", icon: CalendarRange, group: "Criação" },
  { to: "/festas", label: "Produção de Festas", icon: PartyPopper, group: "Criação" },
  { to: "/aulas", label: "Aulas", icon: GraduationCap, group: "Criação" },
  { to: "/musica", label: "Produção Musical", icon: Music, group: "Criação" },
  { to: "/conteudo", label: "Conteúdo", icon: Film, group: "Criação" },
  { to: "/biblioteca", label: "Biblioteca", icon: Library, group: "Administração" },

  { to: "/pessoas", label: "Pessoas", icon: Users, group: "Relacionamento" },
  { to: "/venues", label: "Venues", icon: Building2, group: "Relacionamento" },
  { to: "/fas", label: "Clube de fãs", icon: Heart, group: "Relacionamento" },

  { to: "/tarefas", label: "Tarefas", icon: CheckSquare, group: "Produtividade" },
  { to: "/reunioes", label: "Reuniões", icon: MessagesSquare, group: "Produtividade" },
  { to: "/objetivos", label: "Gestão Estratégica", icon: Target, group: "Produtividade" },
  { to: "/ideias", label: "Ideias & Insights", icon: Lightbulb, group: "Produtividade" },
  { to: "/foco", label: "Energia & Foco", icon: Zap, group: "Produtividade" },

  { to: "/financeiro", label: "Financeiro", icon: Wallet, group: "Administração" },
  { to: "/identidade", label: "Identidade", icon: Sparkles, group: "Administração" },

];

// --- persisted settings keys ---
const SETTINGS_ORDER = "sidebar_order";
const SETTINGS_GROUP_LABELS = "sidebar_group_labels";
const SETTINGS_ITEM_GROUPS = "sidebar_item_groups";

/** Disparado quando a ordem/grupos/labels do menu mudam. */
export const NAV_ORDER_CHANGED = "vistage:nav-order-changed";

// ============================================================
// Nav order
// ============================================================

async function loadNavOrder(): Promise<string[] | null> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_ORDER]
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
      [SETTINGS_ORDER, JSON.stringify(order)]
    );
    window.dispatchEvent(new CustomEvent(NAV_ORDER_CHANGED));
  } catch {
    // non-critical
  }
}

// ============================================================
// Group labels (user-renameable dividers)
// ============================================================

export type GroupLabels = Partial<Record<NavGroup, string>>;

export async function loadGroupLabels(): Promise<GroupLabels> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_GROUP_LABELS]
    );
    if (!rows[0]) return {};
    // Normaliza grupos renomeados (ex.: "Gestão" → "Administração") para que
    // labels customizados de versões anteriores continuem valendo.
    return normalizeGroupLabels(JSON.parse(rows[0].value) as GroupLabels);
  } catch {
    return {};
  }
}

export async function saveGroupLabels(labels: GroupLabels): Promise<void> {
  try {
    const db = getDb();
    await db.execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [SETTINGS_GROUP_LABELS, JSON.stringify(labels)]
    );
    window.dispatchEvent(new CustomEvent(NAV_ORDER_CHANGED));
  } catch {
    // non-critical
  }
}

/** Retorna o label efetivo de um grupo (customizado ou padrão). */
export function effectiveGroupLabel(group: NavGroup, labels: GroupLabels): string {
  return labels[group] ?? group;
}

// ============================================================
// Item group assignments (user can move items between groups)
// ============================================================

export type ItemGroups = Record<string, NavGroup>;

async function loadItemGroups(): Promise<ItemGroups> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [SETTINGS_ITEM_GROUPS]
    );
    if (!rows[0]) return {};
    return JSON.parse(rows[0].value) as ItemGroups;
  } catch {
    return {};
  }
}

export async function saveItemGroups(groups: ItemGroups): Promise<void> {
  try {
    const db = getDb();
    await db.execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [SETTINGS_ITEM_GROUPS, JSON.stringify(groups)]
    );
    window.dispatchEvent(new CustomEvent(NAV_ORDER_CHANGED));
  } catch {
    // non-critical
  }
}

// ============================================================
// Applying saved state
// ============================================================

function applyItemGroups(items: NavItem[], itemGroups: ItemGroups): NavItem[] {
  return items.map((item) =>
    item.group && itemGroups[item.to]
      ? { ...item, group: itemGroups[item.to] }
      : item
  );
}

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

/**
 * Rotas aposentadas → rota atual. "/crm" e "/fornecedores" viraram "/pessoas";
 * normaliza ordens/grupos salvos de versões anteriores para o item novo
 * aparecer no lugar certo (em vez de cair no fim da lista).
 */
const LEGACY_ROUTE_MAP: Record<string, string> = {
  "/crm": "/pessoas",
  "/fornecedores": "/pessoas",
};

/**
 * Grupos de menu renomeados → nome atual. O grupo "Gestão" virou
 * "Administração"; customizações salvas (labels renomeados pelo usuário e
 * itens movidos de grupo em sidebar_group_labels/sidebar_item_groups) ainda
 * referenciam a string antiga — normalizamos ao carregar para não perder a
 * customização nem deixar itens "órfãos" num grupo que não existe mais.
 */
const LEGACY_GROUP_MAP: Record<string, NavGroup> = {
  "Gestão": "Administração",
};

/** Troca um grupo legado pelo atual (ou devolve o mesmo, se já estiver atual). */
function normalizeGroupName(group: string): NavGroup {
  return LEGACY_GROUP_MAP[group] ?? (group as NavGroup);
}

/**
 * Migra os labels customizados de grupo: o que estava sob a chave antiga
 * ("Gestão") passa a valer para a chave nova ("Administração"). Se já houver
 * um label salvo na chave nova, ele tem precedência (não sobrescreve).
 */
function normalizeGroupLabels(labels: GroupLabels): GroupLabels {
  const out: GroupLabels = { ...labels };
  for (const [legacy, current] of Object.entries(LEGACY_GROUP_MAP)) {
    const legacyKey = legacy as NavGroup;
    if (out[legacyKey] !== undefined && out[current] === undefined) {
      out[current] = out[legacyKey];
    }
    delete out[legacyKey];
  }
  return out;
}

function normalizeOrder(order: string[] | null): string[] | null {
  if (!order) return null;
  const mapped = order.map((to) => LEGACY_ROUTE_MAP[to] ?? to);
  return [...new Set(mapped)]; // remove duplicata de /pessoas
}

function normalizeItemGroups(groups: ItemGroups): ItemGroups {
  const out: ItemGroups = {};
  // 1ª passada: rotas ATUAIS (não-aposentadas) — têm precedência sobre a legada
  // (independe da ordem de iteração: a rota atual sempre vence a aposentada).
  for (const [route, group] of Object.entries(groups)) {
    if (LEGACY_ROUTE_MAP[route]) continue;
    out[route] = normalizeGroupName(group);
  }
  // 2ª passada: rota aposentada (ex.: /crm→/pessoas) só herda o grupo se a rota
  // atual ainda não tiver um. Normaliza também o GRUPO ("Gestão"→"Administração").
  for (const [route, group] of Object.entries(groups)) {
    const current = LEGACY_ROUTE_MAP[route];
    if (current && out[current] === undefined) out[current] = normalizeGroupName(group);
  }
  return out;
}

/** Carrega a ordem efetiva já aplicada ao DEFAULT_NAV (com grupos customizados). */
export async function loadOrderedNav(): Promise<NavItem[]> {
  const [rawOrder, rawItemGroups] = await Promise.all([loadNavOrder(), loadItemGroups()]);
  const order = normalizeOrder(rawOrder);
  const itemGroups = normalizeItemGroups(rawItemGroups);
  const withGroups = applyItemGroups(DEFAULT_NAV, itemGroups);
  return order ? applyNavOrder(withGroups, order) : withGroups;
}

/** Módulos que pertencem a um grupo, na ordem salva (ou padrão). */
export function modulesInGroup(nav: NavItem[], group: NavGroup): NavItem[] {
  return nav.filter((i) => i.group === group);
}

