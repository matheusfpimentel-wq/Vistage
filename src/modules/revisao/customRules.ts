import { getDb } from "@/lib/db";
import type { AlertItem } from "./alerts";

/**
 * Regras de alertas/insights CRIADAS pelo usuário (Configurações avançadas).
 *
 * Segurança: `entity`, `field` e `operator` NUNCA viram SQL livre — eles só
 * casam contra este catálogo (whitelist). O único dado do usuário que entra na
 * query é o `value`, e ele é BINDADO como parâmetro ($1/$2). Assim não há
 * injeção nem risco de coluna inexistente.
 */

export type RuleEntityKey =
  | "gig"
  | "track"
  | "contact"
  | "fan"
  | "task"
  | "party"
  | "class";
export type RuleFieldType = "activity" | "date" | "number" | "text" | "enum";
export type RuleOperator =
  | "stale" // activity: sem movimento há > N dias
  | "before_today" // date < hoje
  | "after_today" // date > hoje
  | "is_today" // date = hoje
  | "next_days" // date entre hoje e hoje+N
  | "overdue_days" // date < hoje-N
  | "lt"
  | "gt"
  | "eq"
  | "gte"
  | "lte" // number
  | "empty"
  | "filled"
  | "contains" // text
  | "is"
  | "is_not"
  | "state_stale"; // enum: está em X / não é X / está em X há > N dias

/** Como o editor deve coletar o `value` da condição. */
export type RuleValueKind = "none" | "number" | "text" | "enum" | "state_days";

export type RuleFieldDef = {
  key: string;
  label: string;
  type: RuleFieldType;
  column: string;
  /** Opções para campos do tipo `enum` (valores exatos gravados no banco). */
  options?: readonly string[];
};

export type RuleEntityDef = {
  key: RuleEntityKey;
  label: string;
  table: string;
  route: string;
  /** Filtro-base seguro (constante do catálogo) p/ evitar falsos positivos. */
  baseWhere?: string;
  fields: RuleFieldDef[];
};

// Opções de enums (valores exatos como gravados no banco).
const GIG_STATUS = ["Proposta", "Confirmada", "Concluída", "Cancelada"] as const;
const TRACK_STAGE = [
  "Ideação", "Composição", "Produção", "Mix", "Master",
  "Pré-lançamento", "Lançamento", "Pós-lançamento",
] as const;
const TASK_STATUS = ["A fazer", "Em andamento", "Concluída", "Cancelada"] as const;
const TASK_PRIORITY = ["Baixa", "Média", "Alta", "Urgente"] as const;
const TASK_CATEGORY = ["GIG", "Produção Musical", "Conteúdo", "Festas", "Administrativo", "Pessoal"] as const;
const PARTY_STATUS = ["Planejando", "Confirmada", "Realizada", "Cancelada"] as const;
const FAN_LEVEL = ["Embaixador", "Superfã", "Fã", "Quase fã", "Possível fã"] as const;

export const RULE_ENTITIES: RuleEntityDef[] = [
  {
    key: "gig",
    label: "GIG",
    table: "gigs",
    route: "/gigs",
    baseWhere: "status <> 'Cancelada'",
    fields: [
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
      { key: "date", label: "Data do evento", type: "date", column: "date" },
      { key: "payment_due_date", label: "Vencimento do cachê", type: "date", column: "payment_due_date" },
      { key: "cache_amount", label: "Cachê (R$)", type: "number", column: "cache_amount" },
      { key: "status", label: "Status", type: "enum", column: "status", options: GIG_STATUS },
      { key: "event_name", label: "Nome do evento", type: "text", column: "event_name" },
      { key: "venue_name", label: "Local", type: "text", column: "venue_name" },
      { key: "briefing_file_path", label: "Briefing (arquivo)", type: "text", column: "briefing_file_path" },
    ],
  },
  {
    key: "track",
    label: "Produção (faixa)",
    table: "tracks",
    route: "/musica",
    fields: [
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
      { key: "current_stage", label: "Estágio", type: "enum", column: "current_stage", options: TRACK_STAGE },
      { key: "deadline", label: "Prazo de conclusão", type: "date", column: "deadline" },
      { key: "bpm", label: "BPM", type: "number", column: "bpm" },
    ],
  },
  {
    key: "contact",
    label: "Pessoa (contato)",
    table: "contacts",
    route: "/pessoas",
    fields: [
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
      { key: "last_interaction_at", label: "Última interação", type: "activity", column: "last_interaction_at" },
      { key: "rating", label: "Avaliação (1–5)", type: "number", column: "rating" },
      { key: "phone", label: "Telefone", type: "text", column: "phone" },
      { key: "email", label: "E-mail", type: "text", column: "email" },
      { key: "city", label: "Cidade", type: "text", column: "city" },
    ],
  },
  {
    key: "fan",
    label: "Fã",
    table: "fans",
    route: "/fas",
    fields: [
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
      { key: "last_interaction_at", label: "Última interação", type: "activity", column: "last_interaction_at" },
      { key: "level", label: "Nível", type: "enum", column: "level", options: FAN_LEVEL },
      { key: "city", label: "Cidade", type: "text", column: "city" },
      { key: "phone", label: "Telefone", type: "text", column: "phone" },
      { key: "email", label: "E-mail", type: "text", column: "email" },
    ],
  },
  {
    key: "task",
    label: "Tarefa",
    table: "tasks",
    route: "/tarefas",
    baseWhere: "status <> 'Concluída'",
    fields: [
      { key: "due_date", label: "Prazo", type: "date", column: "due_date" },
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
      { key: "status", label: "Status", type: "enum", column: "status", options: TASK_STATUS },
      { key: "priority", label: "Prioridade", type: "enum", column: "priority", options: TASK_PRIORITY },
      { key: "category", label: "Categoria", type: "enum", column: "category", options: TASK_CATEGORY },
    ],
  },
  {
    key: "party",
    label: "Festa",
    table: "parties",
    route: "/festas",
    fields: [
      { key: "date", label: "Data", type: "date", column: "date" },
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
      { key: "status", label: "Status", type: "enum", column: "status", options: PARTY_STATUS },
      { key: "description", label: "Descrição", type: "text", column: "description" },
      { key: "venue_name", label: "Local", type: "text", column: "venue_name" },
      { key: "expected_capacity", label: "Público estimado", type: "number", column: "expected_capacity" },
    ],
  },
  {
    key: "class",
    label: "Aula",
    table: "classes",
    route: "/aulas",
    fields: [
      { key: "date", label: "Data", type: "date", column: "date" },
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
    ],
  },
];

export const OPERATORS_BY_TYPE: Record<
  RuleFieldType,
  { op: RuleOperator; label: string; needsValue: boolean; valueKind: RuleValueKind }[]
> = {
  activity: [
    { op: "stale", label: "sem movimento há mais de … dias", needsValue: true, valueKind: "number" },
  ],
  date: [
    { op: "before_today", label: "antes de hoje (< hoje)", needsValue: false, valueKind: "none" },
    { op: "after_today", label: "depois de hoje (> hoje)", needsValue: false, valueKind: "none" },
    { op: "is_today", label: "é hoje (= hoje)", needsValue: false, valueKind: "none" },
    { op: "next_days", label: "nos próximos … dias", needsValue: true, valueKind: "number" },
    { op: "overdue_days", label: "venceu há mais de … dias", needsValue: true, valueKind: "number" },
  ],
  number: [
    { op: "lt", label: "menor que (<)", needsValue: true, valueKind: "number" },
    { op: "gt", label: "maior que (>)", needsValue: true, valueKind: "number" },
    { op: "eq", label: "igual a (=)", needsValue: true, valueKind: "number" },
    { op: "gte", label: "maior ou igual (≥)", needsValue: true, valueKind: "number" },
    { op: "lte", label: "menor ou igual (≤)", needsValue: true, valueKind: "number" },
  ],
  text: [
    { op: "empty", label: "está vazio", needsValue: false, valueKind: "none" },
    { op: "filled", label: "está preenchido", needsValue: false, valueKind: "none" },
    { op: "contains", label: "contém o texto …", needsValue: true, valueKind: "text" },
  ],
  enum: [
    { op: "is", label: "é …", needsValue: true, valueKind: "enum" },
    { op: "is_not", label: "não é …", needsValue: true, valueKind: "enum" },
    { op: "state_stale", label: "está em … há mais de … dias", needsValue: true, valueKind: "state_days" },
  ],
};

/** Uma condição "campo · operador · valor" do lado SE da regra. */
export type RuleCondition = { field: string; operator: RuleOperator; value: string | null };
/** Como combinar as condições: all = E (todas), any = OU (qualquer uma). */
export type RuleMatch = "all" | "any";

export type CustomRule = {
  id: number;
  entity: RuleEntityKey;
  /** 1+ condições combinadas por `match`. */
  conditions: RuleCondition[];
  match: RuleMatch;
  message: string;
  severity: "alerta" | "insight";
  /** Alerta "desaparecer ao clicar" (dispensável no sininho). */
  dismissible: number; // 0 | 1
  enabled: number; // 0 | 1
  created_at: string;
  updated_at: string;
};

export type CustomRuleInput = {
  entity: RuleEntityKey;
  conditions: RuleCondition[];
  match: RuleMatch;
  message: string;
  severity: "alerta" | "insight";
  dismissible?: number;
  enabled?: number;
};

/** Linha crua do banco (conditions é JSON; colunas legadas mantidas). */
type CustomRuleRow = {
  id: number;
  entity: RuleEntityKey;
  field: string;
  operator: RuleOperator;
  value: string | null;
  message: string;
  severity: "alerta" | "insight";
  enabled: number;
  conditions: string | null;
  match_mode: string | null;
  dismissible: number | null;
  created_at: string;
  updated_at: string;
};

function rowToRule(r: CustomRuleRow): CustomRule {
  let conditions: RuleCondition[] = [];
  if (r.conditions) {
    try {
      const parsed = JSON.parse(r.conditions) as unknown;
      if (Array.isArray(parsed)) {
        conditions = parsed
          .filter((c): c is RuleCondition => !!c && typeof c === "object" && "field" in c && "operator" in c)
          .map((c) => ({
            field: String((c as RuleCondition).field),
            operator: (c as RuleCondition).operator,
            value: (c as RuleCondition).value ?? null,
          }));
      }
    } catch {
      /* cai no legado abaixo */
    }
  }
  // Regra antiga (sem `conditions`): usa a condição única legada.
  if (conditions.length === 0) {
    conditions = [{ field: r.field, operator: r.operator, value: r.value }];
  }
  return {
    id: r.id,
    entity: r.entity,
    conditions,
    match: r.match_mode === "any" ? "any" : "all",
    message: r.message,
    severity: r.severity,
    dismissible: r.dismissible ?? 0,
    enabled: r.enabled,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function entityDef(key: string): RuleEntityDef | undefined {
  return RULE_ENTITIES.find((e) => e.key === key);
}
export function fieldDef(entity: RuleEntityDef, fieldKey: string): RuleFieldDef | undefined {
  return entity.fields.find((f) => f.key === fieldKey);
}
export function operatorDef(type: RuleFieldType, op: RuleOperator) {
  return OPERATORS_BY_TYPE[type].find((o) => o.op === op);
}
export function operatorNeedsValue(type: RuleFieldType, op: RuleOperator): boolean {
  return operatorDef(type, op)?.needsValue ?? false;
}

/** Codifica/decodifica o valor composto do operador `state_stale` ("estado::dias"). */
export function encodeStateDays(state: string, days: string): string {
  return `${state}::${days}`;
}
export function decodeStateDays(value: string | null): { state: string; days: string } {
  const [state = "", days = ""] = (value ?? "").split("::");
  return { state, days };
}

function describeCondition(e: RuleEntityDef | undefined, c: RuleCondition): string {
  const f = e ? fieldDef(e, c.field) : undefined;
  const fLabel = f?.label ?? c.field;
  if (c.operator === "state_stale") {
    const { state, days } = decodeStateDays(c.value);
    return `${fLabel} em "${state}" há +${days}d`;
  }
  const opLabel = f ? operatorDef(f.type, c.operator)?.label ?? c.operator : c.operator;
  const valuePart = c.value ? ` ${c.value}` : "";
  return `${fLabel} ${opLabel}${valuePart}`;
}

/** Texto legível "Se {entidade} · {cond1} E/OU {cond2}". */
export function describeRule(
  r: Pick<CustomRule, "entity" | "conditions" | "match">
): string {
  const e = entityDef(r.entity);
  const eLabel = e?.label ?? r.entity;
  const joiner = r.match === "any" ? " OU " : " E ";
  const parts = r.conditions.map((c) => describeCondition(e, c));
  return `Se ${eLabel} · ${parts.join(joiner)}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
export async function listCustomRules(): Promise<CustomRule[]> {
  const rows = await getDb().select<CustomRuleRow[]>(`SELECT * FROM custom_rules ORDER BY id DESC`);
  return rows.map(rowToRule);
}

const FALLBACK_COND: RuleCondition = { field: "", operator: "filled", value: null };

export async function createCustomRule(input: CustomRuleInput): Promise<void> {
  const first = input.conditions[0] ?? FALLBACK_COND;
  await getDb().execute(
    `INSERT INTO custom_rules (entity, field, operator, value, message, severity, enabled, conditions, match_mode, dismissible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [input.entity, first.field, first.operator, first.value, input.message, input.severity,
      input.enabled ?? 1, JSON.stringify(input.conditions), input.match, input.dismissible ?? 0]
  );
}
export async function updateCustomRule(id: number, input: CustomRuleInput): Promise<void> {
  const first = input.conditions[0] ?? FALLBACK_COND;
  await getDb().execute(
    `UPDATE custom_rules
        SET entity=$1, field=$2, operator=$3, value=$4, message=$5, severity=$6, enabled=$7,
            conditions=$8, match_mode=$9, dismissible=$10, updated_at=datetime('now')
      WHERE id=$11`,
    [input.entity, first.field, first.operator, first.value, input.message, input.severity,
      input.enabled ?? 1, JSON.stringify(input.conditions), input.match, input.dismissible ?? 0, id]
  );
}
export async function setCustomRuleEnabled(id: number, enabled: boolean): Promise<void> {
  await getDb().execute(
    `UPDATE custom_rules SET enabled=$1, updated_at=datetime('now') WHERE id=$2`,
    [enabled ? 1 : 0, id]
  );
}
export async function deleteCustomRule(id: number): Promise<void> {
  await getDb().execute(`DELETE FROM custom_rules WHERE id=$1`, [id]);
}

// ── Avaliação ─────────────────────────────────────────────────────────────────
/** Monta a condição WHERE a partir do catálogo (colunas/operadores seguros). */
function buildSql(field: RuleFieldDef, operator: RuleOperator): string | null {
  const col = field.column;
  switch (operator) {
    case "stale":
      return `${col} IS NOT NULL AND (julianday('now') - julianday(${col})) > $1`;
    case "before_today":
      return `date(${col}) < date('now')`;
    case "after_today":
      return `date(${col}) > date('now')`;
    case "is_today":
      return `date(${col}) = date('now')`;
    case "next_days":
      return `${col} IS NOT NULL AND julianday(${col}) >= julianday('now') AND julianday(${col}) <= julianday('now') + $1`;
    case "overdue_days":
      return `${col} IS NOT NULL AND julianday(${col}) < julianday('now') - $1`;
    case "lt":
      return `${col} < $1`;
    case "gt":
      return `${col} > $1`;
    case "eq":
      return `${col} = $1`;
    case "gte":
      return `${col} >= $1`;
    case "lte":
      return `${col} <= $1`;
    case "empty":
      return `(${col} IS NULL OR ${col} = '')`;
    case "filled":
      return `(${col} IS NOT NULL AND ${col} <> '')`;
    case "contains":
      return `${col} LIKE '%' || $1 || '%'`;
    case "is":
      return `${col} = $1`;
    case "is_not":
      return `(${col} IS NULL OR ${col} <> $1)`;
    case "state_stale":
      return `${col} = $1 AND updated_at IS NOT NULL AND (julianday('now') - julianday(updated_at)) > $2`;
    default:
      return null;
  }
}

/** Parâmetros bindados ($1/$2), na ordem em que aparecem no SQL. */
function buildParams(operator: RuleOperator, value: string | null): unknown[] {
  switch (operator) {
    case "stale":
    case "next_days":
    case "overdue_days":
    case "lt":
    case "gt":
    case "eq":
    case "gte":
    case "lte": {
      const num = Number(value);
      return [Number.isFinite(num) ? num : value];
    }
    case "contains":
    case "is":
    case "is_not":
      return [value ?? ""];
    case "state_stale": {
      const { state, days } = decodeStateDays(value);
      const num = Number(days);
      return [state, Number.isFinite(num) ? num : 0];
    }
    default:
      return [];
  }
}

/** Cláusula SQL de UMA condição, com placeholders renumerados a partir de startIdx. */
function buildConditionClause(
  e: RuleEntityDef,
  c: RuleCondition,
  startIdx: number
): { sql: string; params: unknown[] } | null {
  const f = fieldDef(e, c.field);
  if (!f) return null;
  if (!OPERATORS_BY_TYPE[f.type].some((o) => o.op === c.operator)) return null;
  let sql = buildSql(f, c.operator);
  if (!sql) return null;
  const params = buildParams(c.operator, c.value);
  // Renumera $1..$n → $startIdx.. (alto→baixo p/ não colidir).
  for (let i = params.length; i >= 1; i--) {
    sql = sql.split(`$${i}`).join(`$${startIdx + i - 1}`);
  }
  return { sql: `(${sql})`, params };
}

/** Conta quantas linhas casam com a regra (condições compostas); null se inválida. */
async function evaluateRuleCount(rule: CustomRule): Promise<number | null> {
  const e = entityDef(rule.entity);
  if (!e) return null;
  if (rule.conditions.length === 0) return null;
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const c of rule.conditions) {
    const built = buildConditionClause(e, c, params.length + 1);
    if (!built) return null; // condição inválida invalida a regra inteira
    clauses.push(built.sql);
    params.push(...built.params);
  }
  const joiner = rule.match === "any" ? " OR " : " AND ";
  const where = [e.baseWhere, `(${clauses.join(joiner)})`].filter(Boolean).join(" AND ");
  const sql = `SELECT COUNT(*) AS n FROM ${e.table} WHERE ${where}`;
  try {
    const rows = await getDb().select<{ n: number }[]>(sql, params);
    return rows[0]?.n ?? 0;
  } catch {
    return null; // regra problemática — ignora isoladamente
  }
}

/**
 * Roda as regras de ALERTA habilitadas e devolve um AlertItem por regra que
 * casou (count > 0). Regras de severidade "insight" NÃO entram aqui — viram
 * insights no banco via `evaluateInsightRules`.
 */
export async function evaluateCustomRules(): Promise<AlertItem[]> {
  let rules: CustomRule[];
  try {
    rules = await listCustomRules();
  } catch {
    return []; // tabela ainda não existe (banco antigo) — silencioso
  }
  const out: AlertItem[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.severity !== "alerta") continue;
    const e = entityDef(rule.entity);
    if (!e) continue;
    const n = await evaluateRuleCount(rule);
    if (n && n > 0) {
      out.push({
        key: `custom-${rule.id}`,
        icon: "warning",
        to: e.route,
        critical: true,
        dismissible: !!rule.dismissible,
        label: (rule.message || describeRule(rule)).replace(/\{n\}/g, String(n)),
      });
    }
  }
  return out;
}

export type InsightRuleHit = { ruleId: number; content: string };

/**
 * Roda as regras de INSIGHT habilitadas e devolve um item por regra que casou
 * (count > 0). Não vão pro sininho — viram insights no banco.
 */
export async function evaluateInsightRules(): Promise<InsightRuleHit[]> {
  let rules: CustomRule[];
  try {
    rules = await listCustomRules();
  } catch {
    return [];
  }
  const out: InsightRuleHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.severity !== "insight") continue;
    const n = await evaluateRuleCount(rule);
    if (n && n > 0) {
      out.push({
        ruleId: rule.id,
        content: (rule.message || describeRule(rule)).replace(/\{n\}/g, String(n)),
      });
    }
  }
  return out;
}
