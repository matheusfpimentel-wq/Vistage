import { getDb } from "@/lib/db";
import type { AlertItem } from "./alerts";

/**
 * Regras de alertas/insights CRIADAS pelo usuário (Configurações avançadas).
 *
 * Segurança: `entity`, `field` e `operator` NUNCA viram SQL livre — eles só
 * casam contra este catálogo (whitelist). O único dado do usuário que entra na
 * query é o `value`, e ele é BINDADO como parâmetro ($1). Assim não há injeção
 * nem risco de coluna inexistente.
 */

export type RuleEntityKey =
  | "gig"
  | "track"
  | "contact"
  | "task"
  | "party"
  | "class";
export type RuleFieldType = "activity" | "date" | "number" | "text";
export type RuleOperator =
  | "stale" // activity: sem movimento há > N dias
  | "before_today" // date < hoje
  | "after_today" // date > hoje
  | "is_today" // date = hoje
  | "lt"
  | "gt"
  | "eq" // number
  | "empty"
  | "filled"; // text

export type RuleFieldDef = {
  key: string;
  label: string;
  type: RuleFieldType;
  column: string;
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
    ],
  },
  {
    key: "track",
    label: "Produção (faixa)",
    table: "tracks",
    route: "/musica",
    fields: [
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
    ],
  },
  {
    key: "contact",
    label: "Pessoa (contato)",
    table: "contacts",
    route: "/pessoas",
    fields: [
      { key: "updated_at", label: "Última atualização", type: "activity", column: "updated_at" },
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
  { op: RuleOperator; label: string; needsValue: boolean }[]
> = {
  activity: [{ op: "stale", label: "sem movimento há mais de … dias", needsValue: true }],
  date: [
    { op: "before_today", label: "antes de hoje (< hoje)", needsValue: false },
    { op: "after_today", label: "depois de hoje (> hoje)", needsValue: false },
    { op: "is_today", label: "é hoje (= hoje)", needsValue: false },
  ],
  number: [
    { op: "lt", label: "menor que (<)", needsValue: true },
    { op: "gt", label: "maior que (>)", needsValue: true },
    { op: "eq", label: "igual a (=)", needsValue: true },
  ],
  text: [
    { op: "empty", label: "está vazio", needsValue: false },
    { op: "filled", label: "está preenchido", needsValue: false },
  ],
};

export type CustomRule = {
  id: number;
  entity: RuleEntityKey;
  field: string;
  operator: RuleOperator;
  value: string | null;
  message: string;
  severity: "alerta" | "insight";
  enabled: number; // 0 | 1
  created_at: string;
  updated_at: string;
};

export type CustomRuleInput = {
  entity: RuleEntityKey;
  field: string;
  operator: RuleOperator;
  value: string | null;
  message: string;
  severity: "alerta" | "insight";
  enabled?: number;
};

export function entityDef(key: string): RuleEntityDef | undefined {
  return RULE_ENTITIES.find((e) => e.key === key);
}
export function fieldDef(entity: RuleEntityDef, fieldKey: string): RuleFieldDef | undefined {
  return entity.fields.find((f) => f.key === fieldKey);
}
export function operatorNeedsValue(type: RuleFieldType, op: RuleOperator): boolean {
  return OPERATORS_BY_TYPE[type].find((o) => o.op === op)?.needsValue ?? false;
}

/** Texto legível "Se {entidade} · {campo} {operador} {valor}". */
export function describeRule(
  r: Pick<CustomRule, "entity" | "field" | "operator" | "value">
): string {
  const e = entityDef(r.entity);
  const f = e ? fieldDef(e, r.field) : undefined;
  const opLabel = f
    ? OPERATORS_BY_TYPE[f.type].find((o) => o.op === r.operator)?.label ?? r.operator
    : r.operator;
  const valuePart = r.value ? ` ${r.value}` : "";
  return `Se ${e?.label ?? r.entity} · ${f?.label ?? r.field} ${opLabel}${valuePart}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
export async function listCustomRules(): Promise<CustomRule[]> {
  return getDb().select<CustomRule[]>(`SELECT * FROM custom_rules ORDER BY id DESC`);
}
export async function createCustomRule(input: CustomRuleInput): Promise<void> {
  await getDb().execute(
    `INSERT INTO custom_rules (entity, field, operator, value, message, severity, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [input.entity, input.field, input.operator, input.value, input.message, input.severity, input.enabled ?? 1]
  );
}
export async function updateCustomRule(id: number, input: CustomRuleInput): Promise<void> {
  await getDb().execute(
    `UPDATE custom_rules
        SET entity=$1, field=$2, operator=$3, value=$4, message=$5, severity=$6, enabled=$7, updated_at=datetime('now')
      WHERE id=$8`,
    [input.entity, input.field, input.operator, input.value, input.message, input.severity, input.enabled ?? 1, id]
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
function buildCondition(
  field: RuleFieldDef,
  operator: RuleOperator
): { sql: string; needsValue: boolean } | null {
  const col = field.column;
  switch (operator) {
    case "stale":
      return { sql: `(julianday('now') - julianday(${col})) > $1`, needsValue: true };
    case "before_today":
      return { sql: `date(${col}) < date('now')`, needsValue: false };
    case "after_today":
      return { sql: `date(${col}) > date('now')`, needsValue: false };
    case "is_today":
      return { sql: `date(${col}) = date('now')`, needsValue: false };
    case "lt":
      return { sql: `${col} < $1`, needsValue: true };
    case "gt":
      return { sql: `${col} > $1`, needsValue: true };
    case "eq":
      return { sql: `${col} = $1`, needsValue: true };
    case "empty":
      return { sql: `(${col} IS NULL OR ${col} = '')`, needsValue: false };
    case "filled":
      return { sql: `(${col} IS NOT NULL AND ${col} <> '')`, needsValue: false };
    default:
      return null;
  }
}

/**
 * Roda as regras habilitadas e devolve um AlertItem por regra que casou
 * (count > 0). Cada regra problemática é ignorada isoladamente — nunca derruba
 * o painel.
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
    if (!rule.enabled) continue;
    const e = entityDef(rule.entity);
    if (!e) continue;
    const f = fieldDef(e, rule.field);
    if (!f) continue;
    // o operador precisa pertencer ao tipo do campo (combinação válida)
    if (!OPERATORS_BY_TYPE[f.type].some((o) => o.op === rule.operator)) continue;
    const cond = buildCondition(f, rule.operator);
    if (!cond) continue;

    const where = [e.baseWhere, cond.sql].filter(Boolean).join(" AND ");
    const sql = `SELECT COUNT(*) AS n FROM ${e.table} WHERE ${where}`;
    const params: unknown[] = [];
    if (cond.needsValue) {
      const num = Number(rule.value);
      params.push(Number.isFinite(num) ? num : rule.value);
    }
    try {
      const rows = await getDb().select<{ n: number }[]>(sql, params);
      const n = rows[0]?.n ?? 0;
      if (n > 0) {
        out.push({
          key: `custom-${rule.id}`,
          icon: rule.severity === "insight" ? "target" : "warning",
          to: e.route,
          critical: rule.severity === "alerta",
          label: (rule.message || describeRule(rule)).replace(/\{n\}/g, String(n)),
        });
      }
    } catch {
      /* regra problemática — ignora isoladamente */
    }
  }
  return out;
}
