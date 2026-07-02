import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { readDocValue, writeDocValue } from "@/lib/docSettings";
import { toLocalISODate } from "@/lib/format";
import { nextNonSocialGig } from "@/modules/gigs/api";
import { FAN_LEVELS } from "./types";
import type {
  FanAutoRule,
  FanClubConfig,
  Fan,
  FanCreateInput,
  FanGroup,
  FanGroupCreateInput,
  FanGroupMember,
  FanGroupUpdateInput,
  FanList,
  FanListCreateInput,
  FanListMember,
  FanInteraction,
  FanInteractionType,
  FanLevel,
  FanPerk,
  FanPerkCreateInput,
  FanPerkUpdateInput,
  FanRuleTrigger,
  FanScoreThresholds,
  FanSegment,
  FanUpdateInput,
  FanUpgradeRules,
} from "./types";

// Re-exporta pra que a UI de fãs (Próximas ações) leia a próxima GIG não-social
// pelo mesmo barril `../api` que já usa, sem alcançar o módulo de GIGs.
export { nextNonSocialGig };

type FanRow = Omit<Fan, "tags"> & { tags: string | null };

function rowToFan(r: FanRow): Fan {
  let tags: string[] = [];
  if (r.tags) {
    try {
      tags = JSON.parse(r.tags) as string[];
    } catch {
      tags = [];
    }
  }
  return { ...r, tags };
}

export type FanFilters = {
  level?: FanLevel | "Todos";
  city?: string;
  search?: string;
  /** Pertence a este grupo (fan_group_members). */
  groupId?: number;
  /** Origem/aquisição exata. */
  origem?: string;
  /** Faixa de dias desde a última interação (decaimento). */
  minDays?: number;
  maxDays?: number;
  /** Tem (true) / não tem (false) algum perk. */
  hasPerk?: boolean;
  /** Apenas embaixadores (destaque manual). */
  ambassador?: boolean;
  /** Esteve nesta GIG (gig_fans). */
  attendedGigId?: number;
  /** Já foi VIP em alguma lista (fan_list_members). */
  wasVip?: boolean;
};

export async function listFans(filters: FanFilters = {}): Promise<Fan[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.level && filters.level !== "Todos") {
    params.push(filters.level);
    where.push(`level = $${params.length}`);
  }
  if (filters.city && filters.city.trim().length > 0) {
    params.push(`%${filters.city.trim()}%`);
    where.push(`city LIKE $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q);
    const i = params.length;
    where.push(
      `(name LIKE $${i - 3} OR email LIKE $${i - 2} OR phone LIKE $${i - 1} OR instagram LIKE $${i})`
    );
  }
  if (filters.groupId) {
    params.push(filters.groupId);
    where.push(`id IN (SELECT fan_id FROM fan_group_members WHERE group_id = $${params.length})`);
  }
  if (filters.origem && filters.origem.trim().length > 0) {
    params.push(filters.origem.trim());
    where.push(`origem = $${params.length}`);
  }
  if (filters.minDays != null) {
    params.push(filters.minDays);
    where.push(`last_interaction_at IS NOT NULL AND julianday('now') - julianday(last_interaction_at) >= $${params.length}`);
  }
  if (filters.maxDays != null) {
    params.push(filters.maxDays);
    where.push(`last_interaction_at IS NOT NULL AND julianday('now') - julianday(last_interaction_at) <= $${params.length}`);
  }
  if (filters.hasPerk === true) {
    where.push(`EXISTS (SELECT 1 FROM fan_perks WHERE fan_perks.fan_id = fans.id)`);
  } else if (filters.hasPerk === false) {
    where.push(`NOT EXISTS (SELECT 1 FROM fan_perks WHERE fan_perks.fan_id = fans.id)`);
  }
  if (filters.ambassador === true) {
    where.push(`is_ambassador = 1`);
  }
  if (filters.attendedGigId) {
    params.push(filters.attendedGigId);
    where.push(`id IN (SELECT fan_id FROM gig_fans WHERE gig_id = $${params.length})`);
  }
  if (filters.wasVip === true) {
    where.push("id IN (SELECT fan_id FROM fan_list_members WHERE fan_id IS NOT NULL)");
  }

  const sql =
    "SELECT * FROM fans" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY CASE level WHEN 'Embaixador' THEN 0 WHEN 'Superfã' THEN 1 WHEN 'Fã' THEN 2 WHEN 'Quase fã' THEN 3 ELSE 4 END, name COLLATE NOCASE ASC";
  const rows = await db.select<FanRow[]>(sql, params);
  return rows.map(rowToFan);
}

export async function getFan(id: number): Promise<Fan | null> {
  const db = getDb();
  const rows = await db.select<FanRow[]>("SELECT * FROM fans WHERE id = $1", [id]);
  return rows[0] ? rowToFan(rows[0]) : null;
}

/** Valores distintos de origem já usados (pro dropdown do filtro). */
export async function listFanOrigens(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select<{ origem: string }[]>(
      `SELECT DISTINCT origem FROM fans WHERE origem IS NOT NULL AND TRIM(origem) <> '' ORDER BY origem COLLATE NOCASE ASC`
    )
    .catch(() => [] as { origem: string }[]);
  return rows.map((r) => r.origem);
}

// ── Segmentos (filtros salvos) ───────────────────────────────────────────────
export async function listFanSegments(): Promise<FanSegment[]> {
  const db = getDb();
  return db
    .select<FanSegment[]>(`SELECT * FROM fan_segments ORDER BY nome COLLATE NOCASE ASC`)
    .catch(() => [] as FanSegment[]);
}

export async function createFanSegment(nome: string, criterios: FanFilters): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO fan_segments (nome, criterios) VALUES ($1, $2)`,
    [nome, JSON.stringify(criterios)]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function deleteFanSegment(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM fan_segments WHERE id = $1`, [id]);
  emitDataChanged();
}

/** Decodifica os critérios JSON de um segmento de volta pra FanFilters (tolerante). */
export function parseFanSegmentCriterios(criterios: string): FanFilters {
  try {
    const o = JSON.parse(criterios) as FanFilters;
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export async function createFan(input: FanCreateInput): Promise<number> {
  const db = getDb();
  const payload = { ...input, tags: JSON.stringify(input.tags ?? []) };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO fans (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  emitDataChanged();
  return id;
}

export async function updateFan(input: FanUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE fans SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

/** Id do fã que referencia este contato (procedência), se existir. */
export async function findFanIdByContactId(contactId: number): Promise<number | null> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM fans WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  return rows[0]?.id ?? null;
}

/**
 * Vincula um fã a um contato do CRM (referência leve de procedência). Usado pela
 * conversão manual Fã→Pessoa — guarda só o vínculo, sem sincronização viva.
 */
export async function setFanContactId(fanId: number, contactId: number | null): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE fans SET contact_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [contactId, fanId]
  );
  emitDataChanged();
}

export async function deleteFan(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fans WHERE id = $1", [id]);
  const { unlinkTasksFromEntity } = await import("@/modules/tasks/api");
  await unlinkTasksFromEntity("fan", id);
  emitDataChanged();
}

export async function listFanInteractions(fanId: number): Promise<FanInteraction[]> {
  const db = getDb();
  return db.select<FanInteraction[]>(
    `SELECT * FROM fan_interactions
     WHERE fan_id = $1
     ORDER BY date DESC, created_at DESC`,
    [fanId]
  );
}

// ============================================================
// Motor de pontuação (engagement score com decaimento)
// ============================================================

const SCORING_DEFAULTS = {
  weightPresenca: 3,
  weightFeedback: 2,
  weightInteracao: 1,
  weightGig: 3,
  // compra = dinheiro = comprometimento, sinal forte
  weightCompra: 4,
  // comportamento de embaixador
  weightIndicacao: 3,
  halfLifeDays: 180,
  thresholds: { quaseFa: 2, fa: 5, superfa: 12, embaixador: 25 },
};

/**
 * Peso de um sinal já com o decaimento por idade aplicado (meia-vida): um sinal
 * com `halfLifeDays` de idade vale metade. Sinais no futuro (ex.: GIG planejada
 * com audiência pré-marcada) ainda não contam.
 */
function decayedWeight(dateStr: string | null, weight: number, halfLifeDays: number): number {
  if (!dateStr || weight <= 0) return 0;
  const iso = dateStr.includes("T") ? dateStr : `${dateStr.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const ageDays = (Date.now() - t) / 86400000;
  if (ageDays < 0) return 0;
  return weight * Math.pow(0.5, ageDays / halfLifeDays);
}

// Embaixador NÃO entra na pontuação automática — é um destaque manual
// (fans.is_ambassador). O score sobe no máximo até Superfã.
function scoreToLevel(score: number, th: Required<FanScoreThresholds>): FanLevel {
  if (score >= th.superfa) return "Superfã";
  if (score >= th.fa) return "Fã";
  if (score >= th.quaseFa) return "Quase fã";
  return "Possível fã";
}

async function computeFanScoreAndLevel(
  fanId: number,
  preRules?: FanUpgradeRules
): Promise<{ score: number; level: FanLevel }> {
  const db = getDb();
  const cfg = (preRules ?? (await loadFanUpgradeRules())).scoring ?? {};
  const wPres = cfg.weightPresenca ?? SCORING_DEFAULTS.weightPresenca;
  const wFb = cfg.weightFeedback ?? SCORING_DEFAULTS.weightFeedback;
  const wInt = cfg.weightInteracao ?? SCORING_DEFAULTS.weightInteracao;
  const wGig = cfg.weightGig ?? SCORING_DEFAULTS.weightGig;
  const wCompra = cfg.weightCompra ?? SCORING_DEFAULTS.weightCompra;
  const wIndic = cfg.weightIndicacao ?? SCORING_DEFAULTS.weightIndicacao;
  const halfLife =
    cfg.halfLifeDays && cfg.halfLifeDays > 0 ? cfg.halfLifeDays : SCORING_DEFAULTS.halfLifeDays;
  const th: Required<FanScoreThresholds> = {
    quaseFa: cfg.thresholds?.quaseFa ?? SCORING_DEFAULTS.thresholds.quaseFa,
    fa: cfg.thresholds?.fa ?? SCORING_DEFAULTS.thresholds.fa,
    superfa: cfg.thresholds?.superfa ?? SCORING_DEFAULTS.thresholds.superfa,
    embaixador: cfg.thresholds?.embaixador ?? SCORING_DEFAULTS.thresholds.embaixador,
  };

  let score = 0;
  const interactions = await db.select<{ date: string; type: string }[]>(
    `SELECT date, type FROM fan_interactions WHERE fan_id = $1`,
    [fanId]
  );
  for (const it of interactions) {
    const w =
      it.type === "Presença"
        ? wPres
        : it.type === "Feedback"
          ? wFb
          : it.type === "Compra"
            ? wCompra
            : it.type === "Indicação"
              ? wIndic
              : wInt;
    score += decayedWeight(it.date, w, halfLife);
  }
  // presenças reais em shows: audiência marcada na GIG, datada pela data do show
  const gigs = await db.select<{ date: string | null }[]>(
    `SELECT g.date FROM gig_fans gf JOIN gigs g ON g.id = gf.gig_id WHERE gf.fan_id = $1`,
    [fanId]
  );
  for (const g of gigs) {
    score += decayedWeight(g.date, wGig, halfLife);
  }

  return { score, level: scoreToLevel(score, th) };
}

/** Score de engajamento atual de um fã (com decaimento). Para exibição. */
export async function fanEngagementScore(fanId: number): Promise<number> {
  return (await computeFanScoreAndLevel(fanId)).score;
}

/**
 * Recalcula o nível do fã a partir do histórico (pontuação com decaimento).
 * Idempotente e reconciliável: reflete corretamente quando interações são
 * adicionadas OU removidas. Só grava se o nível mudou.
 */
export async function recomputeFanLevel(fanId: number): Promise<void> {
  const db = getDb();
  const { level: computed } = await computeFanScoreAndLevel(fanId);
  const cur = await db.select<{ level: string; is_ambassador: number }[]>(
    `SELECT level, is_ambassador FROM fans WHERE id = $1`,
    [fanId]
  );
  if (!cur[0]) return;
  // Embaixador é manual (is_ambassador) e imune ao recálculo.
  const level = cur[0].is_ambassador ? "Embaixador" : computed;
  if (cur[0].level !== level) {
    // Marca a transição de nível (alimenta o balde "Parabenizar" e o "no nível
    // X desde {data}" do perfil).
    await db.execute(
      `UPDATE fans SET level = $1, nivel_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [level, fanId]
    );
    emitDataChanged();
  }
}

/**
 * Recalcula o nível de TODOS os fãs de uma vez (botão "recalcular agora").
 * Carrega as regras uma única vez. Retorna quantos níveis mudaram.
 */
export async function recomputeAllFanLevels(): Promise<number> {
  const db = getDb();
  const rules = await loadFanUpgradeRules();
  const fans = await db.select<{ id: number; level: string; is_ambassador: number }[]>(
    `SELECT id, level, is_ambassador FROM fans`
  );
  let changed = 0;
  for (const f of fans) {
    const { level: computed } = await computeFanScoreAndLevel(f.id, rules);
    const level = f.is_ambassador ? "Embaixador" : computed;
    if (f.level !== level) {
      await db.execute(
        `UPDATE fans SET level = $1, nivel_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [level, f.id]
      );
      changed++;
    }
  }
  if (changed > 0) emitDataChanged();
  return changed;
}

export async function addFanInteraction(
  fanId: number,
  date: string,
  note: string,
  type: FanInteractionType = "Interação",
  special = false
): Promise<number> {
  const db = getDb();
  const autoSpecial = type !== "Interação" ? true : special;
  const res = await db.execute(
    `INSERT INTO fan_interactions (fan_id, date, note, type, special) VALUES ($1, $2, $3, $4, $5)`,
    [fanId, date, note, type, autoSpecial ? 1 : 0]
  );
  await db.execute(
    `UPDATE fans
        SET last_interaction_at = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
    [date, fanId]
  );

  // Recalcula o nível a partir do histórico completo (pontuação com
  // decaimento). Substitui o antigo bump de 1 nível por interação especial +
  // regras de limiar — que compunham (podiam pular 2 níveis de uma vez) e nunca
  // reconciliavam quando algo era apagado.
  try {
    await recomputeFanLevel(fanId);
  } catch {
    // não interrompe o registro da interação
  }

  // Close any open follow-up tasks for this fan since they just interacted
  try {
    const followupRows = await db.select<{ id: number }[]>(
      `SELECT t.id FROM tasks t WHERE t.title LIKE 'Follow-up: %' AND t.status <> 'Concluída' AND t.description LIKE $1`,
      [`%fan_id:${fanId}%`]
    );
    for (const row of followupRows) {
      const { updateTask } = await import("@/modules/tasks/api");
      await updateTask({ id: row.id, status: "Concluída" }).catch(() => {});
    }
  } catch {
    // silently skip
  }

  return Number(res.lastInsertId);
}

export async function saveFanUpgradeRules(rules: FanUpgradeRules): Promise<void> {
  // Conteúdo do documento: viaja no .vistage + marca como não salvo.
  await writeDocValue("fan_upgrade_rules", JSON.stringify(rules));
}

export async function loadFanUpgradeRules(): Promise<FanUpgradeRules> {
  const raw = await readDocValue("fan_upgrade_rules", "fan_upgrade_rules");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FanUpgradeRules;
  } catch {
    return {};
  }
}

// ============================================================
// Configuração do clube (ações rápidas + catálogo de perks)
// ============================================================

export const DEFAULT_FAN_CLUB_CONFIG: FanClubConfig = {
  actions: [
    { id: "reativar", label: "Reativar fã", titleTemplate: "Reativar contato com {nome}" },
    { id: "agradecer", label: "Agradecer presença", titleTemplate: "Agradecer presença de {nome} no show" },
    { id: "convidar", label: "Convidar p/ próximo show", titleTemplate: "Convidar {nome} para o próximo show" },
    { id: "brinde", label: "Enviar brinde", titleTemplate: "Enviar brinde para {nome}" },
    { id: "aniversario", label: "Mensagem de aniversário", titleTemplate: "Mensagem de aniversário para {nome}" },
  ],
  perks: [
    { id: "vinil", category: "Brinde", name: "Vinil autografado" },
    { id: "vip", category: "VIP", name: "Lista VIP no próximo show" },
    { id: "meet", category: "Acesso", name: "Meet & greet" },
    { id: "cortesia", category: "Cortesia", name: "Par de ingressos" },
  ],
};

export async function loadFanClubConfig(): Promise<FanClubConfig> {
  const raw = await readDocValue("fan_club_config", "fan_club_config");
  if (!raw) return DEFAULT_FAN_CLUB_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<FanClubConfig>;
    return {
      actions: parsed.actions ?? DEFAULT_FAN_CLUB_CONFIG.actions,
      perks: parsed.perks ?? DEFAULT_FAN_CLUB_CONFIG.perks,
    };
  } catch {
    return DEFAULT_FAN_CLUB_CONFIG;
  }
}

export async function saveFanClubConfig(cfg: FanClubConfig): Promise<void> {
  // Conteúdo do documento: viaja no .vistage + marca como não salvo.
  await writeDocValue("fan_club_config", JSON.stringify(cfg));
}

// ============================================================
// Ações programadas (regras gatilho → ação automáticas)
// ============================================================
// As regras moram em document_settings (chave "fan_auto_rules"), igual a
// fan_club_config/fan_upgrade_rules: viajam no .vistage e marcam "não salvo".
// SEM tabela nova. O executor (runFanAutoRules) é IDEMPOTENTE: cada regra dispara
// no máximo uma vez por fã, garantido por um marcador `[auto:<ruleId>]` gravado
// no que a ação cria + checagem desse marcador antes de agir.

export async function loadFanAutoRules(): Promise<FanAutoRule[]> {
  const raw = await readDocValue("fan_auto_rules", "fan_auto_rules");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FanAutoRule[]) : [];
  } catch {
    return [];
  }
}

export async function saveFanAutoRules(rules: FanAutoRule[]): Promise<void> {
  // Conteúdo do documento: viaja no .vistage + marca como não salvo.
  await writeDocValue("fan_auto_rules", JSON.stringify(rules));
}

/** Marcador de idempotência gravado pelas ações automáticas de uma regra. */
function autoMarker(ruleId: string): string {
  return `[auto:${ruleId}]`;
}

/** Dias inteiros decorridos desde uma data ISO (SQLite datetime/date). >= 0. */
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  // Datas só-data (YYYY-MM-DD) ou datetime do SQLite ("YYYY-MM-DD HH:MM:SS", UTC).
  const iso = dateStr.includes("T")
    ? dateStr
    : dateStr.length <= 10
      ? `${dateStr}T00:00:00Z`
      : `${dateStr.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** O fã está nesse nível OU em um superior (índice menor em FAN_LEVELS)? */
function levelAtLeast(fanLevel: FanLevel, target: FanLevel): boolean {
  const fi = FAN_LEVELS.indexOf(fanLevel);
  const ti = FAN_LEVELS.indexOf(target);
  if (fi < 0 || ti < 0) return false;
  return fi <= ti; // FAN_LEVELS vai do mais alto (índice 0) ao mais baixo
}

/** Avalia o gatilho de uma regra contra um fã (true = ação deve disparar). */
function triggerMatches(trigger: FanRuleTrigger, fan: Fan): boolean {
  switch (trigger.type) {
    case "level_reached":
      return levelAtLeast(fan.level, trigger.level);
    case "fan_for_days": {
      // Com nível: tempo no nível atual (precisa estar nele) a partir de
      // nivel_changed_at; sem nível: tempo de cadastro (created_at).
      if (trigger.level) {
        if (fan.level !== trigger.level) return false;
        const d = daysSince(fan.nivel_changed_at ?? fan.created_at);
        return d != null && d >= trigger.days;
      }
      const d = daysSince(fan.created_at);
      return d != null && d >= trigger.days;
    }
    case "inactive_days": {
      if (trigger.level && fan.level !== trigger.level) return false;
      const d = daysSince(fan.last_interaction_at);
      return d != null && d >= trigger.days;
    }
    default:
      return false;
  }
}

/**
 * Executa as ações programadas (regras gatilho → ação) sobre todos os fãs.
 * Retorna o nº de ações efetivamente disparadas.
 *
 * IDEMPOTÊNCIA (ponto crítico): toda ação automática grava o marcador
 * `[auto:<ruleId>]` no que cria (perk.notes / interaction.note / descrição da
 * tarefa). ANTES de agir, verifica se já existe algo com esse marcador para o fã
 * e, se existir, PULA. Assim cada regra dispara no máximo UMA vez por fã, mesmo
 * rodando o executor várias vezes (a cada abertura da tela). Rodar 3x seguidas
 * cria a ação só na 1ª: na 2ª/3ª o marcador já está lá e tudo é pulado.
 * Espelha a idempotência por marcador de syncSuperfanFollowupTasks.
 */
export async function runFanAutoRules(): Promise<number> {
  const db = getDb();
  let rules: FanAutoRule[];
  try {
    rules = (await loadFanAutoRules()).filter((r) => r.enabled);
  } catch {
    return 0;
  }
  if (rules.length === 0) return 0;

  const fans = await listFans();
  let fired = 0;

  for (const rule of rules) {
    const marker = autoMarker(rule.id);
    const like = `%${marker}%`;
    for (const fan of fans) {
      if (!triggerMatches(rule.trigger, fan)) continue;
      try {
        const act = rule.action;
        if (act.type === "grant_perk") {
          // Já concedido por esta regra? (perk com o marcador na nota)
          const dup = await db.select<{ id: number }[]>(
            `SELECT id FROM fan_perks WHERE fan_id = $1 AND notes LIKE $2 LIMIT 1`,
            [fan.id, like]
          );
          if (dup.length > 0) continue;
          await addFanPerk({
            fan_id: fan.id,
            category: act.perkCategory,
            name: act.perkName,
            status: "Planejado",
            date: null,
            notes: `Ação programada ${marker}`,
          });
          fired++;
        } else if (act.type === "log_interaction") {
          // Já registrada por esta regra? (interação com o marcador na nota)
          const dup = await db.select<{ id: number }[]>(
            `SELECT id FROM fan_interactions WHERE fan_id = $1 AND note LIKE $2 LIMIT 1`,
            [fan.id, like]
          );
          if (dup.length > 0) continue;
          const baseNote = act.note?.trim() ? act.note.trim() : "Ação programada";
          await addFanInteraction(
            fan.id,
            toLocalISODate(),
            `${baseNote} ${marker}`,
            act.interactionType
          );
          fired++;
        } else if (act.type === "create_task") {
          // Já existe tarefa ABERTA vinculada ao fã com o marcador? (título ou
          // descrição). Espelha a checagem de idempotência do follow-up.
          const dup = await db.select<{ id: number }[]>(
            `SELECT t.id FROM tasks t
               JOIN task_links tl ON tl.task_id = t.id
              WHERE tl.entity_type = 'fan' AND tl.entity_id = $1
                AND t.status NOT IN ('Concluída', 'Cancelada')
                AND (t.title LIKE $2 OR t.description LIKE $2)
              LIMIT 1`,
            [fan.id, like]
          );
          if (dup.length > 0) continue;
          await createFanTask(fan.id, act.taskTitle, {
            description: `Ação programada ${marker}`,
          });
          fired++;
        }
      } catch {
        // não interrompe as demais regras/fãs por um erro pontual
      }
    }
  }

  return fired;
}

export async function getFanInteractionCounts(fanId: number): Promise<{
  total: number;
  presences: number;
  feedbacks: number;
}> {
  const db = getDb();
  const rows = await db.select<{ type: string; n: number }[]>(
    `SELECT type, COUNT(*) as n FROM fan_interactions WHERE fan_id = $1 GROUP BY type`,
    [fanId]
  );
  let total = 0, presences = 0, feedbacks = 0;
  for (const r of rows) {
    total += r.n;
    if (r.type === "Presença") presences = r.n;
    if (r.type === "Feedback") feedbacks = r.n;
  }
  return { total, presences, feedbacks };
}

export async function listFanInteractionCounts(): Promise<Map<number, number>> {
  const db = getDb();
  const rows = await db.select<{ fan_id: number; n: number }[]>(
    `SELECT fan_id, COUNT(*) as n FROM fan_interactions GROUP BY fan_id`
  );
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.fan_id, r.n);
  return map;
}

/**
 * @deprecated Mantido só por compatibilidade com chamadores existentes (ex.:
 * DebriefForm, que reavalia fãs após o debrief). Hoje só recalcula o nível pelo
 * motor de pontuação — que já sobe E desce conforme o engajamento.
 */
export async function checkAndUpgradeFan(fanId: number): Promise<void> {
  await recomputeFanLevel(fanId);
}

export async function syncSuperfanFollowupTasks(): Promise<void> {
  try {
    const db = getDb();
    const superfans = await db.select<{ id: number; name: string }[]>(
      `SELECT f.id, f.name FROM fans f
       WHERE f.level IN ('Superfã', 'Embaixador')
         AND NOT EXISTS (
           SELECT 1 FROM fan_interactions fi
           WHERE fi.fan_id = f.id AND fi.date >= date('now', '-30 days')
         )`
    );
    for (const fan of superfans) {
      const existing = await db.select<{ id: number }[]>(
        `SELECT t.id FROM tasks t
         WHERE t.title LIKE 'Follow-up: %'
           AND t.status <> 'Concluída'
           AND t.description LIKE $1`,
        [`%fan_id:${fan.id}%`]
      );
      if (existing.length === 0) {
        const { createTask } = await import("@/modules/tasks/api");
        await createTask({
          title: `Follow-up: ${fan.name}`,
          description: `fan_id:${fan.id} · Superfã/Embaixador sem interação há 30+ dias`,
          category: "Pessoal",
          priority: "Média",
          status: "A fazer",
          due_date: null,
          gig_id: null,
          contact_id: null,
          tags: ["fã", "follow-up"],
        });
      }
    }
  } catch {
    // silently skip
  }
}

export async function deleteFanInteraction(id: number): Promise<void> {
  const db = getDb();
  // pega o fã ANTES de apagar pra poder recalcular o nível depois
  const rows = await db.select<{ fan_id: number }[]>(
    "SELECT fan_id FROM fan_interactions WHERE id = $1",
    [id]
  );
  await db.execute("DELETE FROM fan_interactions WHERE id = $1", [id]);
  const fanId = rows[0]?.fan_id;
  if (fanId != null) {
    // reconcilia o nível: apagar engajamento pode (corretamente) rebaixar o fã
    await recomputeFanLevel(fanId);
  }
}

export type FanStats = {
  embaixador: number;
  superfa: number;
  fa: number;
  quaseFa: number;
  possivelFa: number;
};

export async function getFanStats(): Promise<FanStats> {
  const db = getDb();
  const rows = await db.select<{ level: string; n: number }[]>(
    "SELECT level, COUNT(*) as n FROM fans GROUP BY level"
  );
  const stats: FanStats = { embaixador: 0, superfa: 0, fa: 0, quaseFa: 0, possivelFa: 0 };
  for (const r of rows) {
    if (r.level === "Embaixador") stats.embaixador = r.n;
    else if (r.level === "Superfã") stats.superfa = r.n;
    else if (r.level === "Fã") stats.fa = r.n;
    else if (r.level === "Quase fã") stats.quaseFa = r.n;
    else if (r.level === "Possível fã") stats.possivelFa = r.n;
  }
  return stats;
}

// ===== Fan Groups =====

export async function listFanGroups(): Promise<FanGroup[]> {
  const db = getDb();
  return db.select<FanGroup[]>("SELECT * FROM fan_groups ORDER BY name ASC");
}

export async function createFanGroup(input: FanGroupCreateInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO fan_groups (name, whatsapp_group, origin, notes) VALUES ($1, $2, $3, $4)`,
    [input.name, input.whatsapp_group, input.origin, input.notes]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function updateFanGroup(input: FanGroupUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = [...cols.map((k) => (rest as Record<string, unknown>)[k]), id];
  await db.execute(
    `UPDATE fan_groups SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

export async function deleteFanGroup(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_groups WHERE id = $1", [id]);
  emitDataChanged();
}

export async function listFanGroupMembers(groupId: number): Promise<FanGroupMember[]> {
  const db = getDb();
  return db.select<FanGroupMember[]>(
    "SELECT * FROM fan_group_members WHERE group_id = $1 ORDER BY id ASC",
    [groupId]
  );
}

/**
 * Mapa fã → grupos a que pertence (multi-grupo: um fã pode estar em vários).
 * Junta fan_group_members (só membros com fan_id) com fan_groups, agrupando por
 * fan_id. Usado pela lista de fãs (chips de grupo + visão agrupada em pastas).
 */
export async function listFanGroupMap(): Promise<Map<number, { id: number; name: string }[]>> {
  const db = getDb();
  const rows = await db
    .select<{ fan_id: number; group_id: number; group_name: string }[]>(
      `SELECT m.fan_id AS fan_id, g.id AS group_id, g.name AS group_name
         FROM fan_group_members m
         JOIN fan_groups g ON g.id = m.group_id
        WHERE m.fan_id IS NOT NULL
        ORDER BY g.name COLLATE NOCASE ASC`
    )
    .catch(() => [] as { fan_id: number; group_id: number; group_name: string }[]);
  const map = new Map<number, { id: number; name: string }[]>();
  for (const r of rows) {
    const arr = map.get(r.fan_id) ?? [];
    arr.push({ id: r.group_id, name: r.group_name });
    map.set(r.fan_id, arr);
  }
  return map;
}

/**
 * Por grupo: nº de membros + soma das interações dos fãs membros. Para o
 * cabeçalho do grupo (contagens ao lado do nome, sem precisar expandir). Membros
 * por nome livre (sem fan_id) não somam interações. Read-only.
 */
export async function listFanGroupStats(): Promise<
  Map<number, { members: number; interactions: number }>
> {
  const db = getDb();
  const rows = await db
    .select<{ group_id: number; members: number; interactions: number }[]>(
      `SELECT m.group_id AS group_id,
              COUNT(DISTINCT m.id) AS members,
              COALESCE(SUM(ic.n), 0) AS interactions
         FROM fan_group_members m
         LEFT JOIN (SELECT fan_id, COUNT(*) AS n FROM fan_interactions GROUP BY fan_id) ic
           ON ic.fan_id = m.fan_id
        GROUP BY m.group_id`
    )
    .catch(() => [] as { group_id: number; members: number; interactions: number }[]);
  const map = new Map<number, { members: number; interactions: number }>();
  for (const r of rows) map.set(r.group_id, { members: r.members, interactions: r.interactions });
  return map;
}

export async function addFanGroupMember(
  groupId: number,
  fanId: number | null,
  name: string | null,
  notes: string | null
): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO fan_group_members (group_id, fan_id, name, notes) VALUES ($1, $2, $3, $4)",
    [groupId, fanId, name, notes]
  );
  emitDataChanged();
}

/**
 * Adiciona um fã a um grupo só se ainda não estiver nele (multi-grupo: o fã pode
 * pertencer a vários, então isto NÃO remove de outros). Idempotente: retorna
 * false se já era membro (nada inserido). Usado pelo arrastar-fã→pasta da lista.
 */
export async function addFanToGroupIfAbsent(groupId: number, fanId: number): Promise<boolean> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM fan_group_members WHERE group_id = $1 AND fan_id = $2 LIMIT 1",
    [groupId, fanId]
  );
  if (existing[0]) return false;
  await db.execute(
    "INSERT INTO fan_group_members (group_id, fan_id, name, notes) VALUES ($1, $2, NULL, NULL)",
    [groupId, fanId]
  );
  emitDataChanged();
  return true;
}

export async function removeFanGroupMember(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_group_members WHERE id = $1", [id]);
  emitDataChanged();
}

// ===== Listas (lista da casa pra mandar antes da GIG) =====

export async function listFanLists(): Promise<FanList[]> {
  const db = getDb();
  return db.select<FanList[]>("SELECT * FROM fan_lists ORDER BY created_at DESC");
}

export async function createFanList(input: FanListCreateInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "INSERT INTO fan_lists (name, gig_id, notes) VALUES ($1, $2, $3)",
    [input.name, input.gig_id, input.notes]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function updateFanList(input: {
  id: number;
  name?: string;
  gig_id?: number | null;
  notes?: string | null;
}): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = [...cols.map((k) => (rest as Record<string, unknown>)[k]), id];
  await db.execute(
    `UPDATE fan_lists SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

export async function deleteFanList(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_lists WHERE id = $1", [id]);
  emitDataChanged();
}

export async function listFanListMembers(listId: number): Promise<FanListMember[]> {
  const db = getDb();
  return db.select<FanListMember[]>(
    "SELECT * FROM fan_list_members WHERE list_id = $1 ORDER BY id ASC",
    [listId]
  );
}

export async function addFanListMember(
  listId: number,
  fanId: number | null,
  name: string | null
): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO fan_list_members (list_id, fan_id, name) VALUES ($1, $2, $3)",
    [listId, fanId, name]
  );
  emitDataChanged();
}

export async function removeFanListMember(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_list_members WHERE id = $1", [id]);
  emitDataChanged();
}

/**
 * Importa os membros de uma lista VIP (fan_lists) como fãs do Clube de Fãs,
 * marcando presença nesta GIG (sinal de pontuação). Pós-show: "trazer quem
 * esteve na Lista VIP como fãs, com origem = aquele GIG e a presença marcada".
 *
 * Por membro:
 *  - Já é fã cadastrado (fan_id): só marca presença (alreadyFans).
 *  - Nome livre: dedup por nome (case-insensitive, trim). Se achar um fã com o
 *    mesmo nome, vincula (linked); senão cria um novo "Possível fã" com
 *    origem = "GIG: {nome}" (created). Em ambos os casos aponta o membro pro fã
 *    e marca presença.
 *
 * Idempotente: rodar de novo não duplica (dedup por nome + INSERT OR IGNORE em
 * gig_fans). Recalcula o nível de cada fã tocado (presença sobe a pontuação).
 */
export async function importVipListAsFans(
  listId: number,
  gig: { id: number; name: string }
): Promise<{ created: number; linked: number; alreadyFans: number }> {
  const db = getDb();
  const members = await listFanListMembers(listId);
  let created = 0;
  let linked = 0;
  let alreadyFans = 0;

  for (const m of members) {
    let fanId = m.fan_id;

    if (fanId) {
      // já é fã cadastrado: só marca presença
      alreadyFans++;
    } else {
      const name = m.name?.trim();
      if (!name) continue; // membro vazio (sem fan_id e sem nome) — ignora

      // dedup por nome (case-insensitive, trim)
      const existing = await db.select<{ id: number }[]>(
        "SELECT id FROM fans WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1",
        [name]
      );
      if (existing[0]) {
        fanId = existing[0].id;
        linked++;
      } else {
        fanId = await createFan({
          name,
          level: "Possível fã",
          is_ambassador: 0,
          instagram: null,
          email: null,
          phone: null,
          city: null,
          tags: [],
          notes: null,
          photo_path: null,
          contact_id: null,
          origem: `GIG: ${gig.name}`,
        });
        created++;
      }
      // aponta o membro da lista pro fã (idempotência: na próxima vez já tem fan_id)
      await db.execute("UPDATE fan_list_members SET fan_id = $1 WHERE id = $2", [fanId, m.id]);
    }

    await addGigFan(gig.id, fanId);
    await recomputeFanLevel(fanId);
  }

  emitDataChanged();
  return { created, linked, alreadyFans };
}

/** Listas VIP (fan_lists) ligadas a uma GIG específica. */
export async function listFanListsForGig(gigId: number): Promise<FanList[]> {
  const db = getDb();
  return db.select<FanList[]>(
    "SELECT * FROM fan_lists WHERE gig_id = $1 ORDER BY created_at DESC",
    [gigId]
  );
}

/**
 * GIGs em que um fã é VIP (membro de alguma lista ligada a um gig). Derivado:
 * junta fan_list_members → fan_lists (com gig_id) → gigs. Read-only.
 */
export async function listVipGigsForFan(
  fanId: number
): Promise<{ gig_id: number; gig_name: string; list_name: string }[]> {
  const db = getDb();
  return db
    .select<{ gig_id: number; gig_name: string; list_name: string }[]>(
      `SELECT g.id AS gig_id,
              COALESCE(NULLIF(g.event_name, ''), g.venue_name) AS gig_name,
              fl.name AS list_name
         FROM fan_list_members flm
         JOIN fan_lists fl ON fl.id = flm.list_id
         JOIN gigs g ON g.id = fl.gig_id
        WHERE flm.fan_id = $1 AND fl.gig_id IS NOT NULL
        ORDER BY g.date DESC NULLS LAST, g.id DESC`,
      [fanId]
    )
    .catch(() => [] as { gig_id: number; gig_name: string; list_name: string }[]);
}

/**
 * Visão derivada "Fãs que já foram VIP": cada fã (com cadastro, fan_id não nulo)
 * que é membro de alguma lista VIP, com a contagem de listas. Read-only.
 */
export async function listVipFansDerived(): Promise<
  { fan_id: number; name: string; level: FanLevel; lists: number }[]
> {
  const db = getDb();
  return db
    .select<{ fan_id: number; name: string; level: FanLevel; lists: number }[]>(
      `SELECT f.id AS fan_id, f.name AS name, f.level AS level,
              COUNT(DISTINCT flm.list_id) AS lists
         FROM fan_list_members flm
         JOIN fans f ON f.id = flm.fan_id
        WHERE flm.fan_id IS NOT NULL
        GROUP BY f.id, f.name, f.level
        ORDER BY f.name COLLATE NOCASE ASC`
    )
    .catch(() => [] as { fan_id: number; name: string; level: FanLevel; lists: number }[]);
}

// ===== GIG presence (gig_fans) =====

export async function setGigFans(gigId: number, fanIds: number[]): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM gig_fans WHERE gig_id = $1", [gigId]);
  for (const fanId of fanIds) {
    await db.execute(
      "INSERT OR IGNORE INTO gig_fans (gig_id, fan_id) VALUES ($1, $2)",
      [gigId, fanId]
    );
  }
  emitDataChanged();
}

export async function addGigFan(gigId: number, fanId: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT OR IGNORE INTO gig_fans (gig_id, fan_id) VALUES ($1, $2)",
    [gigId, fanId]
  );
  emitDataChanged();
}

export async function listFansForGig(gigId: number): Promise<Fan[]> {
  const db = getDb();
  const rows = await db.select<FanRow[]>(
    `SELECT f.* FROM gig_fans gf
       JOIN fans f ON f.id = gf.fan_id
      WHERE gf.gig_id = $1
      ORDER BY f.name COLLATE NOCASE ASC`,
    [gigId]
  );
  return rows.map(rowToFan);
}

export async function gigCountForFan(fanId: number): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) as n FROM gig_fans WHERE fan_id = $1",
    [fanId]
  );
  return rows[0]?.n ?? 0;
}

export async function topFansByPresence(
  limit = 10
): Promise<{ fan_id: number; name: string; gigs: number }[]> {
  const db = getDb();
  return db.select<{ fan_id: number; name: string; gigs: number }[]>(
    `SELECT gf.fan_id as fan_id, f.name as name, COUNT(*) as gigs
       FROM gig_fans gf
       JOIN fans f ON f.id = gf.fan_id
      GROUP BY gf.fan_id, f.name
      ORDER BY gigs DESC, f.name COLLATE NOCASE ASC
      LIMIT $1`,
    [limit]
  );
}

/** Lista os shows (gigs) que um fã assistiu, mais recentes primeiro. */
export async function listGigsForFan(
  fanId: number
): Promise<{ id: number; name: string | null; date: string | null; city: string | null }[]> {
  const db = getDb();
  return db.select<{ id: number; name: string | null; date: string | null; city: string | null }[]>(
    `SELECT g.id as id,
            COALESCE(NULLIF(g.event_name, ''), g.venue_name) as name,
            g.date as date,
            g.venue_city as city
       FROM gig_fans gf
       JOIN gigs g ON g.id = gf.gig_id
      WHERE gf.fan_id = $1
      ORDER BY g.date DESC NULLS LAST, g.id DESC`,
    [fanId]
  );
}

// ===== Superfície "Hoje" — fila de ação sobre o dado existente =====
// NÃO é tabela nova: junta, por consulta, os fãs que precisam de ação agora,
// agrupados por motivo. Cada item vira ação rápida (tarefa) e/ou perk de 1 clique.
export type FanTodayItem = {
  fan_id: number;
  name: string;
  level: FanLevel;
  city: string | null;
  photo_path: string | null;
  /** Contexto curto do motivo (ex.: "sem contato há 45d"). */
  detail: string;
};
export type FanTodayBuckets = {
  agradecer: FanTodayItem[];
  parabenizar: FanTodayItem[];
  reativar: FanTodayItem[];
  aniversarios: FanTodayItem[];
  boasVindas: FanTodayItem[];
  /** Esteve num show recente e ainda não foi convidado pra próxima GIG. */
  convidar: FanTodayItem[];
};

/**
 * Uma ação agendada = TAREFA pendente vinculada a um fã COM vencimento. Não é
 * tabela nova: é uma referência cruzada às Tarefas (task_links entity_type
 * "fan"). Usada pela seção "ações anotadas" de Próximas ações.
 */
export type ScheduledFanAction = {
  task_id: number;
  title: string;
  due_date: string;
  fan_id: number;
  fan_name: string;
  fan_level: FanLevel;
  fan_photo_path: string | null;
};

/**
 * Tarefas pendentes vinculadas a fãs e COM vencimento (ações agendadas/anotadas),
 * já com o fã resolvido, ordenadas por vencimento (atrasadas primeiro). É a
 * referência cruzada "vejo as que anotei" da aba Próximas ações. Read-only.
 */
export async function listScheduledFanActions(): Promise<ScheduledFanAction[]> {
  const db = getDb();
  return db
    .select<ScheduledFanAction[]>(
      `SELECT t.id AS task_id,
              t.title AS title,
              t.due_date AS due_date,
              f.id AS fan_id,
              f.name AS fan_name,
              f.level AS fan_level,
              f.photo_path AS fan_photo_path
         FROM tasks t
         JOIN task_links tl ON tl.task_id = t.id
         JOIN fans f ON f.id = tl.entity_id
        WHERE tl.entity_type = 'fan'
          AND t.due_date IS NOT NULL
          AND t.status NOT IN ('Concluída', 'Cancelada')
        ORDER BY t.due_date ASC, f.name COLLATE NOCASE ASC`
    )
    .catch(() => [] as ScheduledFanAction[]);
}

function daysSinceISO(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
function relDays(n: number): string {
  return n <= 0 ? "hoje" : n === 1 ? "ontem" : `há ${n}d`;
}

type TodayRow = { fan_id: number; name: string; level: FanLevel; city: string | null; photo_path: string | null };

export async function loadFanToday(): Promise<FanTodayBuckets> {
  const db = getDb();

  // Agradecer presença: esteve num show nos últimos 21 dias e não há interação
  // registrada nesse período (proxy de "ainda não agradecido").
  const agradecer = await db
    .select<(TodayRow & { gig_date: string })[]>(
      `SELECT f.id AS fan_id, f.name AS name, f.level AS level, f.city AS city, f.photo_path AS photo_path,
              MAX(g.date) AS gig_date
         FROM gig_fans gf
         JOIN gigs g ON g.id = gf.gig_id
         JOIN fans f ON f.id = gf.fan_id
        WHERE g.date >= date('now','-21 days') AND g.date <= date('now')
          AND NOT EXISTS (
            SELECT 1 FROM fan_interactions fi
             WHERE fi.fan_id = f.id AND fi.date >= date('now','-21 days')
          )
        GROUP BY f.id
        ORDER BY gig_date DESC
        LIMIT 50`
    )
    .catch(() => [] as (TodayRow & { gig_date: string })[]);

  // Parabenizar: subiu de nível nos últimos 14 dias (transição registrada em
  // nivel_changed_at pelo recálculo de pontuação). Só níveis que valem festejo.
  const parabenizar = await db
    .select<(TodayRow & { changed: string })[]>(
      `SELECT id AS fan_id, name, level, city, photo_path, nivel_changed_at AS changed
         FROM fans
        WHERE nivel_changed_at IS NOT NULL
          AND nivel_changed_at >= date('now','-14 days')
          AND level IN ('Fã','Superfã','Embaixador')
        ORDER BY nivel_changed_at DESC
        LIMIT 50`
    )
    .catch(() => [] as (TodayRow & { changed: string })[]);

  // Reativar: fã/superfã/embaixador sem contato há 30+ dias (decaindo de nível).
  const reativar = await db
    .select<(TodayRow & { last: string })[]>(
      `SELECT id AS fan_id, name, level, city, photo_path, last_interaction_at AS last
         FROM fans
        WHERE level IN ('Fã','Superfã','Embaixador')
          AND last_interaction_at IS NOT NULL
          AND last_interaction_at < date('now','-30 days')
        ORDER BY last_interaction_at ASC
        LIMIT 50`
    )
    .catch(() => [] as (TodayRow & { last: string })[]);

  // Boas-vindas: fã novo, sem nenhuma interação registrada e sem presença recente.
  const boas = await db
    .select<(TodayRow & { created_at: string })[]>(
      `SELECT id AS fan_id, name, level, city, photo_path, created_at
         FROM fans f
        WHERE NOT EXISTS (SELECT 1 FROM fan_interactions fi WHERE fi.fan_id = f.id)
          AND NOT EXISTS (
            SELECT 1 FROM gig_fans gf JOIN gigs g ON g.id = gf.gig_id
             WHERE gf.fan_id = f.id AND g.date >= date('now','-21 days')
          )
        ORDER BY created_at DESC
        LIMIT 50`
    )
    .catch(() => [] as (TodayRow & { created_at: string })[]);

  // Convidar pro próximo show: esteve num show recente (mesma janela do
  // "Agradecer", presença nos últimos 21 dias) e ainda NÃO tem um convite
  // pendente — proxy: nenhuma tarefa aberta vinculada ao fã começando com
  // "Convidar ". Só faz sentido se houver uma próxima GIG não-social à frente.
  const next = await nextNonSocialGig();
  const convidar = next
    ? await db
        .select<(TodayRow & { gig_date: string })[]>(
          `SELECT f.id AS fan_id, f.name AS name, f.level AS level, f.city AS city, f.photo_path AS photo_path,
                  MAX(g.date) AS gig_date
             FROM gig_fans gf
             JOIN gigs g ON g.id = gf.gig_id
             JOIN fans f ON f.id = gf.fan_id
            WHERE g.date >= date('now','-21 days') AND g.date <= date('now')
              AND NOT EXISTS (
                SELECT 1 FROM tasks t
                  JOIN task_links tl ON tl.task_id = t.id
                 WHERE tl.entity_type = 'fan' AND tl.entity_id = f.id
                   AND t.status NOT IN ('Concluída', 'Cancelada')
                   AND t.title LIKE 'Convidar %'
              )
            GROUP BY f.id
            ORDER BY gig_date DESC
            LIMIT 50`
        )
        .catch(() => [] as (TodayRow & { gig_date: string })[])
    : [];

  // Aniversários: fã com contato vinculado cujo aniversário cai nos próximos 7 dias.
  const bday = await db
    .select<(TodayRow & { birthday: string })[]>(
      `SELECT f.id AS fan_id, f.name AS name, f.level AS level, f.city AS city, f.photo_path AS photo_path, c.birthday AS birthday
         FROM fans f
         JOIN contacts c ON c.id = f.contact_id
        WHERE c.birthday IS NOT NULL AND length(c.birthday) >= 10`
    )
    .catch(() => [] as (TodayRow & { birthday: string })[]);

  return {
    agradecer: agradecer.map((r) => ({ ...stripRow(r), detail: `esteve num show ${relDays(daysSinceISO(r.gig_date))}` })),
    parabenizar: parabenizar.map((r) => ({ ...stripRow(r), detail: `subiu para ${r.level}` })),
    reativar: reativar.map((r) => ({ ...stripRow(r), detail: `sem contato há ${daysSinceISO(r.last)}d` })),
    boasVindas: boas.map((r) => ({ ...stripRow(r), detail: "novo, sem interação ainda" })),
    convidar: convidar.map((r) => ({
      ...stripRow(r),
      detail: next ? `esteve num show ${relDays(daysSinceISO(r.gig_date))} · ${next.name}` : "",
    })),
    aniversarios: birthdaysWithin(bday, 7),
  };
}

function stripRow(r: TodayRow): TodayRow {
  return { fan_id: r.fan_id, name: r.name, level: r.level, city: r.city, photo_path: r.photo_path };
}

/** Filtra os que fazem aniversário dentro de `within` dias e monta o detalhe. */
function birthdaysWithin(rows: (TodayRow & { birthday: string })[], within: number): FanTodayItem[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: { item: FanTodayItem; days: number }[] = [];
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.birthday);
    if (!m) continue;
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    let next = new Date(today.getFullYear(), mo, da);
    if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, mo, da);
    const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
    if (days <= within) {
      const detail = days === 0 ? "faz aniversário hoje 🎂" : days === 1 ? "faz aniversário amanhã" : `aniversário em ${days}d`;
      out.push({ item: { ...stripRow(r), detail }, days });
    }
  }
  return out.sort((a, b) => a.days - b.days).map((x) => x.item);
}

// ===== Perks / VIP / brindes (clube de fãs) =====

export async function listFanPerks(fanId: number): Promise<FanPerk[]> {
  const db = getDb();
  return db.select<FanPerk[]>(
    `SELECT * FROM fan_perks
      WHERE fan_id = $1
      ORDER BY CASE status WHEN 'Planejado' THEN 0 ELSE 1 END,
               COALESCE(date, '') DESC, created_at DESC`,
    [fanId]
  );
}

export async function addFanPerk(input: FanPerkCreateInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO fan_perks (fan_id, category, name, status, date, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.fan_id, input.category, input.name, input.status, input.date, input.notes]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function updateFanPerk(input: FanPerkUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = [...cols.map((k) => (rest as Record<string, unknown>)[k]), id];
  await db.execute(
    `UPDATE fan_perks SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

/** Marca um perk/brinde como entregue, datando hoje se ainda não tiver data. */
export async function markFanPerkDelivered(id: number): Promise<void> {
  const db = getDb();
  const today = toLocalISODate(); // data LOCAL (à noite no Brasil o UTC pularia 1 dia)
  await db.execute(
    `UPDATE fan_perks
        SET status = 'Entregue',
            date = COALESCE(date, $1),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
    [today, id]
  );
  emitDataChanged();
}

export async function deleteFanPerk(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_perks WHERE id = $1", [id]);
  emitDataChanged();
}

/** Quantos perks/brindes cada fã possui (para badges na lista). */
export async function listFanPerkCounts(): Promise<Map<number, number>> {
  const db = getDb();
  const rows = await db.select<{ fan_id: number; n: number }[]>(
    `SELECT fan_id, COUNT(*) as n FROM fan_perks GROUP BY fan_id`
  );
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.fan_id, r.n);
  return map;
}

// ===== Ação → tarefa (cria tarefa já vinculada ao fã) =====

/**
 * Cria uma tarefa já vinculada ao fã (task_links entity_type "fan"). Usado pelas
 * ações rápidas do clube de fãs (reativar, agradecer presença, enviar brinde…).
 */
export async function createFanTask(
  fanId: number,
  title: string,
  opts?: { description?: string | null; due_date?: string | null }
): Promise<number> {
  const fan = await getFan(fanId);
  const { createTask, setTaskLinks } = await import("@/modules/tasks/api");
  const taskId = await createTask({
    title,
    description: opts?.description ?? null,
    category: "Pessoal",
    priority: "Média",
    status: "A fazer",
    due_date: opts?.due_date ?? null,
    gig_id: null,
    contact_id: null,
    tags: ["fã"],
  });
  await setTaskLinks(taskId, [
    { entity_type: "fan", entity_id: fanId, label: fan?.name ?? null },
  ]);
  emitDataChanged();
  return taskId;
}

/**
 * Cria UMA tarefa agrupada vinculada a VÁRIOS fãs de uma vez (task_links
 * entity_type "fan" para cada um). Usado pelas ações de Próximas ações: em vez de
 * uma tarefa por fã, junta todo mundo do mesmo balde numa tarefa só
 * ("Convidar fulano, cicrano e beltrano para o próximo show").
 */
export async function createGroupedFanTask(
  fanIds: number[],
  title: string,
  opts?: { description?: string | null; due_date?: string | null }
): Promise<number> {
  const { createTask, setTaskLinks } = await import("@/modules/tasks/api");
  const taskId = await createTask({
    title,
    description: opts?.description ?? null,
    category: "Pessoal",
    priority: "Média",
    status: "A fazer",
    due_date: opts?.due_date ?? null,
    gig_id: null,
    contact_id: null,
    tags: ["fã"],
  });
  const links: { entity_type: "fan"; entity_id: number; label: string | null }[] = [];
  for (const id of fanIds) {
    const fan = await getFan(id);
    links.push({ entity_type: "fan", entity_id: id, label: fan?.name ?? null });
  }
  if (links.length > 0) await setTaskLinks(taskId, links);
  emitDataChanged();
  return taskId;
}
