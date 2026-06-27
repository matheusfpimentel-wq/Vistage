import { getDb } from "@/lib/db";
import type { AlertItem, AlertSeverity } from "./alerts";

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

/** Funções de agregação sobre um conjunto (fatia D). */
export type AggFn = "COUNT" | "SUM" | "AVG" | "RATIO";
/** Comparador de uma agregação contra o limiar (subconjunto numérico). */
export type AggOperator = "lt" | "gt" | "eq" | "gte" | "lte";

export type RuleFieldDef = {
  key: string;
  label: string;
  type: RuleFieldType;
  column: string;
  /** Opções para campos do tipo `enum` (valores exatos gravados no banco). */
  options?: readonly string[];
};

/**
 * Conjunto agregável ligado a uma entidade (fatia D — multi-entidade). É uma
 * tabela FILHA referenciável por FK (ex.: Festa → Ingressos via party_id). Tudo
 * vem do catálogo (tabela, FK e colunas), então segue na whitelist.
 */
export type RuleRelationDef = {
  key: string;
  label: string;
  table: string;
  /** Coluna FK na tabela filha que aponta pro id da entidade primária. */
  fk: string;
  fields: RuleFieldDef[];
};

export type RuleEntityDef = {
  key: RuleEntityKey;
  label: string;
  table: string;
  route: string;
  /** Filtro-base seguro (constante do catálogo) p/ evitar falsos positivos. */
  baseWhere?: string;
  fields: RuleFieldDef[];
  /** Conjuntos filhos agregáveis (fatia D). */
  relations?: RuleRelationDef[];
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
const PARTY_STATUS = ["Ideia", "Planejando", "Confirmada", "Em vendas", "Realizada", "Cancelada"] as const;
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
    relations: [
      {
        key: "tickets",
        label: "Ingressos",
        table: "party_tickets",
        fk: "party_id",
        fields: [
          { key: "quantity_sold", label: "Qtd. vendida", type: "number", column: "quantity_sold" },
          { key: "quantity_total", label: "Qtd. total (meta)", type: "number", column: "quantity_total" },
          { key: "price", label: "Preço (R$)", type: "number", column: "price" },
        ],
      },
      {
        key: "budget",
        label: "Orçamento",
        table: "party_budget_items",
        fk: "party_id",
        fields: [
          { key: "projected_amount", label: "Valor projetado (R$)", type: "number", column: "projected_amount" },
          { key: "actual_amount", label: "Valor real (R$)", type: "number", column: "actual_amount" },
        ],
      },
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

// ── Agregações (fatia D) ──────────────────────────────────────────────────────
export const AGG_FUNCTIONS: { fn: AggFn; label: string; needsField: boolean; needsField2: boolean }[] = [
  { fn: "COUNT", label: "Quantidade (contar)", needsField: false, needsField2: false },
  { fn: "SUM", label: "Soma", needsField: true, needsField2: false },
  { fn: "AVG", label: "Média", needsField: true, needsField2: false },
  { fn: "RATIO", label: "Razão (a ÷ b)", needsField: true, needsField2: true },
];

export const AGG_OPERATORS: { op: AggOperator; label: string }[] = [
  { op: "lt", label: "menor que (<)" },
  { op: "lte", label: "menor ou igual (≤)" },
  { op: "gt", label: "maior que (>)" },
  { op: "gte", label: "maior ou igual (≥)" },
  { op: "eq", label: "igual a (=)" },
];

/** Conjunto agregável resolvido: "self" (a própria entidade) + as relações. */
export type AggSource = { key: string; label: string; table: string; fk: string | null; fields: RuleFieldDef[] };

/** Fontes de agregação de uma entidade: ela mesma (campos numéricos) + filhos. */
export function aggSources(e: RuleEntityDef): AggSource[] {
  const self: AggSource = {
    key: "self",
    label: `Esta ${e.label.toLowerCase()}`,
    table: e.table,
    fk: null,
    fields: e.fields.filter((f) => f.type === "number"),
  };
  const rels: AggSource[] = (e.relations ?? []).map((r) => ({
    key: r.key, label: r.label, table: r.table, fk: r.fk, fields: r.fields,
  }));
  return [self, ...rels];
}
export function aggSourceDef(e: RuleEntityDef, setKey: string): AggSource | undefined {
  return aggSources(e).find((s) => s.key === setKey);
}

/** Folha "campo · operador · valor" — a condição de sempre (lado SE). */
export type FieldLeaf = {
  kind?: "field";
  field: string;
  operator: RuleOperator;
  value: string | null;
};
/** Folha "agregação" — COUNT/SUM/AVG/RATIO sobre um conjunto, vs. um limiar. */
export type AggLeaf = {
  kind: "aggregate";
  agg: AggFn;
  /** "self" = a própria entidade; senão a key de uma relação (ex.: "tickets"). */
  set: string;
  /** Coluna agregada (SUM/AVG; numerador no RATIO). Ignorada em COUNT. */
  field?: string;
  /** Denominador (apenas RATIO). */
  field2?: string;
  operator: AggOperator;
  value: string | null;
};
/** Uma condição do lado SE: folha de campo OU folha de agregação. */
export type RuleCondition = FieldLeaf | AggLeaf;

export function isAggregateLeaf(c: RuleCondition): c is AggLeaf {
  return (c as AggLeaf).kind === "aggregate";
}

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
  /** Prioridade do alerta (crítico/atenção/info) — dirige cor e ordenação. */
  severidade: AlertSeverity;
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
  severidade?: AlertSeverity;
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
  severidade: string | null;
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
          .filter((c): c is Record<string, unknown> => {
            if (!c || typeof c !== "object") return false;
            const o = c as Record<string, unknown>;
            // Folha de agregação OU folha de campo (a ausência de `kind` = campo).
            return o.kind === "aggregate"
              ? "agg" in o && "set" in o && "operator" in o
              : "field" in o && "operator" in o;
          })
          .map((o): RuleCondition =>
            o.kind === "aggregate"
              ? {
                  kind: "aggregate",
                  agg: o.agg as AggFn,
                  set: String(o.set ?? "self"),
                  field: o.field != null ? String(o.field) : undefined,
                  field2: o.field2 != null ? String(o.field2) : undefined,
                  operator: o.operator as AggOperator,
                  value: (o.value as string | null) ?? null,
                }
              : {
                  kind: "field",
                  field: String(o.field),
                  operator: o.operator as RuleOperator,
                  value: (o.value as string | null) ?? null,
                }
          );
      }
    } catch {
      /* cai no legado abaixo */
    }
  }
  // Regra antiga (sem `conditions`): usa a condição única legada.
  if (conditions.length === 0) {
    conditions = [{ kind: "field", field: r.field, operator: r.operator, value: r.value }];
  }
  return {
    id: r.id,
    entity: r.entity,
    conditions,
    match: r.match_mode === "any" ? "any" : "all",
    message: r.message,
    severity: r.severity,
    severidade: (r.severidade as AlertSeverity) || "atencao",
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
  if (isAggregateLeaf(c)) {
    const src = e ? aggSourceDef(e, c.set) : undefined;
    const srcLabel = src?.label ?? c.set;
    const colLabel = (k?: string) => (k ? src?.fields.find((f) => f.key === k)?.label ?? k : "");
    const opLabel = AGG_OPERATORS.find((o) => o.op === c.operator)?.label ?? c.operator;
    const body =
      c.agg === "COUNT"
        ? `qtd. de ${srcLabel}`
        : c.agg === "RATIO"
        ? `razão ${colLabel(c.field)} ÷ ${colLabel(c.field2)} (${srcLabel})`
        : `${c.agg === "SUM" ? "soma" : "média"} de ${colLabel(c.field)} (${srcLabel})`;
    return `${body} ${opLabel} ${c.value ?? ""}`.trim();
  }
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
  if (r.conditions.length === 0) return "Sempre (sem condição)";
  const e = entityDef(r.entity);
  const eLabel = e?.label ?? r.entity;
  const joiner = r.match === "any" ? " OU " : " E ";
  const parts = r.conditions.map((c) => describeCondition(e, c));
  return `Se ${eLabel} · ${parts.join(joiner)}`;
}

/**
 * true se TODAS as folhas da regra ainda casam com o catálogo atual (campos,
 * conjuntos e colunas de agregação existem). Falso = "regra zumbi": ela aparece
 * na lista mas nunca dispara, porque uma referência (campo/relação) sumiu do
 * catálogo. A UI usa isto pra avisar em vez de deixar o usuário no escuro.
 */
export function ruleResolvable(r: Pick<CustomRule, "entity" | "conditions">): boolean {
  const e = entityDef(r.entity);
  if (!e) return false;
  return r.conditions.every((c) => {
    if (isAggregateLeaf(c)) {
      const src = aggSourceDef(e, c.set);
      if (!src) return false;
      const fn = AGG_FUNCTIONS.find((f) => f.fn === c.agg);
      if (!fn) return false;
      if (fn.needsField && !src.fields.some((f) => f.key === c.field)) return false;
      if (fn.needsField2 && !src.fields.some((f) => f.key === c.field2)) return false;
      return true;
    }
    return !!fieldDef(e, c.field);
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
export async function listCustomRules(): Promise<CustomRule[]> {
  const rows = await getDb().select<CustomRuleRow[]>(`SELECT * FROM custom_rules ORDER BY id DESC`);
  return rows.map(rowToRule);
}

/**
 * Colunas legadas (field/operator/value) — só um vestígio para regras antigas
 * sem `conditions`. A fonte da verdade é o JSON `conditions`. Quando a 1ª folha
 * é uma agregação, gravamos valores neutros (a coluna não é lida nesse caso).
 */
function legacyCols(input: CustomRuleInput): { field: string; operator: RuleOperator; value: string | null } {
  const first = input.conditions[0];
  if (first && !isAggregateLeaf(first)) {
    return { field: first.field, operator: first.operator, value: first.value };
  }
  return { field: "", operator: "filled", value: null };
}

export async function createCustomRule(input: CustomRuleInput): Promise<void> {
  const lg = legacyCols(input);
  await getDb().execute(
    `INSERT INTO custom_rules (entity, field, operator, value, message, severity, severidade, enabled, conditions, match_mode, dismissible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [input.entity, lg.field, lg.operator, lg.value, input.message, input.severity,
      input.severidade ?? "atencao", input.enabled ?? 1, JSON.stringify(input.conditions), input.match, input.dismissible ?? 0]
  );
}
export async function updateCustomRule(id: number, input: CustomRuleInput): Promise<void> {
  const lg = legacyCols(input);
  await getDb().execute(
    `UPDATE custom_rules
        SET entity=$1, field=$2, operator=$3, value=$4, message=$5, severity=$6, severidade=$7, enabled=$8,
            conditions=$9, match_mode=$10, dismissible=$11, updated_at=datetime('now')
      WHERE id=$12`,
    [input.entity, lg.field, lg.operator, lg.value, input.message, input.severity,
      input.severidade ?? "atencao", input.enabled ?? 1, JSON.stringify(input.conditions), input.match, input.dismissible ?? 0, id]
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

/** Cláusula SQL de UMA folha de campo, com placeholders renumerados a partir de startIdx. */
function buildConditionClause(
  e: RuleEntityDef,
  c: FieldLeaf,
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

/**
 * Conta quantas linhas casam com as FOLHAS DE CAMPO da regra (combinadas por
 * match); null se inválida. Recebe só folhas de campo — as de agregação têm
 * caminho próprio (evaluateAggLeaf). Defensivamente, uma folha de agregação aqui
 * invalida a contagem.
 */
async function evaluateRuleCount(rule: CustomRule): Promise<number | null> {
  const e = entityDef(rule.entity);
  if (!e) return null;
  if (rule.conditions.length === 0) return null;
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const c of rule.conditions) {
    if (isAggregateLeaf(c)) return null;
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
 * Avalia UMA folha de agregação: monta o escalar (COUNT/SUM/AVG/RATIO) sobre o
 * conjunto (self ou relação filha), compara ao limiar (em JS) e devolve hit +
 * escalar. Tabela/coluna/FK vêm do catálogo (whitelist); o limiar nunca entra no
 * SQL (é comparado em JS), então não há injeção. null = folha inválida.
 */
async function evaluateAggLeaf(
  e: RuleEntityDef,
  leaf: AggLeaf
): Promise<{ hit: boolean; scalar: number | null } | null> {
  const src = aggSourceDef(e, leaf.set);
  if (!src) return null;
  const col = leaf.field ? src.fields.find((f) => f.key === leaf.field)?.column : undefined;
  const col2 = leaf.field2 ? src.fields.find((f) => f.key === leaf.field2)?.column : undefined;

  let expr: string;
  if (leaf.agg === "COUNT") {
    expr = "COUNT(*)";
  } else if (leaf.agg === "SUM") {
    if (!col) return null;
    expr = `COALESCE(SUM(${col}), 0)`;
  } else if (leaf.agg === "AVG") {
    if (!col) return null;
    expr = `COALESCE(AVG(${col}), 0)`;
  } else if (leaf.agg === "RATIO") {
    if (!col || !col2) return null;
    // Divisão protegida (denominador zero → NULL → sem disparo).
    expr = `CASE WHEN COALESCE(SUM(${col2}), 0) = 0 THEN NULL ELSE SUM(${col}) * 1.0 / SUM(${col2}) END`;
  } else {
    return null;
  }

  // Limiar ausente/vazio NÃO vira 0 (Number(null)/Number("") são 0): regra sem
  // limiar é inválida e não dispara.
  if (leaf.value == null || String(leaf.value).trim() === "") return null;
  const threshold = Number(leaf.value);
  if (!Number.isFinite(threshold)) return null;

  let sql: string;
  if (src.fk == null) {
    // "self": a própria tabela da entidade, respeitando o filtro-base.
    sql = `SELECT ${expr} AS v FROM ${src.table}${e.baseWhere ? ` WHERE ${e.baseWhere}` : ""}`;
  } else {
    // Conjunto filho: linhas cujo FK aponta pra um pai que passa no baseWhere.
    const parentWhere = e.baseWhere ? ` WHERE ${e.baseWhere}` : "";
    sql = `SELECT ${expr} AS v FROM ${src.table} WHERE ${src.fk} IN (SELECT id FROM ${e.table}${parentWhere})`;
  }

  let scalar: number | null;
  try {
    const rows = await getDb().select<{ v: number | null }[]>(sql, []);
    scalar = rows[0]?.v ?? null;
  } catch {
    return null;
  }
  if (scalar == null) return { hit: false, scalar: null };
  return { hit: compareAgg(scalar, leaf.operator, threshold), scalar };
}

function compareAgg(a: number, op: AggOperator, b: number): boolean {
  switch (op) {
    case "lt": return a < b;
    case "lte": return a <= b;
    case "gt": return a > b;
    case "gte": return a >= b;
    case "eq": return a === b;
    default: return false;
  }
}

/**
 * Avalia a regra inteira (folhas de campo + de agregação) combinadas por match.
 * As de campo viram UM booleano de grupo (count > 0, com o joiner E/OU dentro do
 * SQL); cada agregação vira um booleano. Combina tudo por match. Devolve hit +
 * n (linhas que casaram, p/ {n}) + v (escalar da 1ª agregação, p/ {v}). null se
 * qualquer folha for inválida (a regra inteira é ignorada).
 */
async function evaluateRuleHit(
  rule: CustomRule
): Promise<{ hit: boolean; n: number; v: number | null } | null> {
  const e = entityDef(rule.entity);
  if (!e) return null;
  if (rule.conditions.length === 0) return null;

  const fieldLeaves = rule.conditions.filter((c): c is FieldLeaf => !isAggregateLeaf(c));
  const aggLeaves = rule.conditions.filter(isAggregateLeaf);

  const bools: boolean[] = [];
  let n = 0;
  let v: number | null = null;

  if (fieldLeaves.length > 0) {
    const cnt = await evaluateRuleCount({ ...rule, conditions: fieldLeaves });
    if (cnt == null) return null;
    n = cnt;
    bools.push(cnt > 0);
  }
  for (const leaf of aggLeaves) {
    const r = await evaluateAggLeaf(e, leaf);
    if (r == null) return null;
    if (v == null) v = r.scalar;
    bools.push(r.hit);
  }
  if (bools.length === 0) return null;

  const hit = rule.match === "any" ? bools.some(Boolean) : bools.every(Boolean);
  if (fieldLeaves.length === 0) n = hit ? 1 : 0;
  return { hit, n, v };
}

/** Substitui {n} (quantidade) e {v} (valor do cálculo) no texto da mensagem. */
function fillMessage(msg: string, n: number, v: number | null): string {
  const vStr = v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(2);
  return msg.replace(/\{n\}/g, String(n)).replace(/\{v\}/g, vStr);
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
    const r = await evaluateRuleHit(rule);
    if (r && r.hit) {
      out.push({
        key: `custom-${rule.id}`,
        icon: "warning",
        to: e.route,
        critical: rule.severidade === "critico",
        severidade: rule.severidade,
        dismissible: !!rule.dismissible,
        label: fillMessage(rule.message || describeRule(rule), r.n, r.v),
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
    // Insight SEM condição = aparece sempre (provocação fixa, sem gatilho).
    if (rule.conditions.length === 0) {
      if (rule.message.trim()) {
        out.push({ ruleId: rule.id, content: fillMessage(rule.message, 1, null) });
      }
      continue;
    }
    const r = await evaluateRuleHit(rule);
    if (r && r.hit) {
      out.push({
        ruleId: rule.id,
        content: fillMessage(rule.message || describeRule(rule), r.n, r.v),
      });
    }
  }
  return out;
}
