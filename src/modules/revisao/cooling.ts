import { getDb } from "@/lib/db";
import { toLocalISODate } from "@/lib/format";
import { getHiddenModules } from "@/lib/moduleVisibility";
import { emitDataChanged } from "@/lib/events";
import { getCoolingDays, getCoolingHeat, getDisabledRuleIds } from "./ruleConfig";
import type { AlertItem } from "./alerts";

/**
 * "Esfriando" — alerta UNIFICADO de inatividade.
 *
 * Funde os antigos alertas correlatos de estagnação (superfãs sem interação,
 * faixas/conteúdos parados, contatos importantes sem retorno) num conceito só:
 * tudo que você ALIMENTA continuamente e ficou sem movimento além do "tempo de
 * resfriamento" configurável (padrão 15 dias) está esfriando — EXCETO itens de
 * criação que você já concluiu (faixa em Pós-lançamento, conteúdo Publicado).
 *
 * Cada tipo de entidade vira no máximo UM alerta agregado ("3 contatos
 * esfriando …"), dispensável com "Deixar esfriar": isso registra os itens atuais
 * como aceitos (ack) e eles somem — voltam a aparecer só quando você os toca de
 * novo e eles esfriam outra vez. O ack mora em app_settings (escopo de máquina,
 * sem marcar o documento como sujo), igual ao snooze dos demais alertas.
 */

/** Id da regra no catálogo (liga/desliga em Configurações avançadas). */
export const COOLING_RULE_ID = "cooling";
const ACK_DB_KEY = "cooling.acked";

type ColdItem = { ref: string; id: number; name: string; lastFed: string };

// app_settings: { "<entity>:<id>": "<ISO date do ack>" }
export async function loadAcks(): Promise<Record<string, string>> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [ACK_DB_KEY]
    );
    const raw = rows.length > 0 ? (JSON.parse(rows[0].value) as unknown) : {};
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** "Deixar esfriar": registra cada ref como aceito hoje (some até tocar de novo). */
export async function ackCooling(refs: string[]): Promise<void> {
  if (!refs || refs.length === 0) return;
  const acks = await loadAcks();
  const today = toLocalISODate();
  for (const r of refs) acks[r] = today;
  // GC leve: descarta acks com mais de ~400 dias (item já reaquecido ou excluído)
  // pra o blob não crescer pra sempre. Roda só no clique do usuário — sem laço
  // de escrita (não acontece durante o load/refresh).
  const floor = new Date();
  floor.setDate(floor.getDate() - 400);
  const floorISO = toLocalISODate(floor);
  const pruned: Record<string, string> = {};
  for (const [k, v] of Object.entries(acks)) {
    if (typeof v === "string" && v >= floorISO) pruned[k] = v;
  }
  try {
    await getDb().execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [ACK_DB_KEY, JSON.stringify(pruned)]
    );
  } catch {
    /* banco indisponível — ignora */
  }
  emitDataChanged();
}

// Um item está oculto se foi aceito (ack) numa data >= a da sua última atividade:
// o ack só vale enquanto o item não se mexe. Se ele foi tocado DEPOIS do ack
// (lastFed > ackDate), o ack expira e ele volta a esfriar normalmente.
export function isAcked(acks: Record<string, string>, ref: string, lastFed: string): boolean {
  const ack = acks[ref];
  return !!ack && ack >= lastFed.slice(0, 10);
}

async function safeRows<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

/**
 * Calcula os alertas de "esfriando" — um por tipo de entidade com itens frios,
 * já descontando os que o usuário deixou esfriar (ack) e os módulos ocultos.
 * É chamado junto dos demais alertas assíncronos (sininho + tela de Alertas).
 */
export async function loadCoolingAlerts(): Promise<AlertItem[]> {
  // Regra desligada no editor de Configurações avançadas → não calcula nada.
  if (getDisabledRuleIds().includes(COOLING_RULE_ID)) return [];

  // Calor mínimo (só ideias têm calor). 0 = desliga a regra INTEIRA (todas as
  // entidades), conforme configurado em Configurações avançadas.
  const heatMin = getCoolingHeat();
  if (heatMin === 0) return [];

  const days = getCoolingDays();
  const cut = new Date();
  cut.setDate(cut.getDate() - days);
  const cutoff = toLocalISODate(cut);
  const hidden = getHiddenModules();
  const acks = await loadAcks();
  const db = getDb();
  const out: AlertItem[] = [];

  const fresh = (items: ColdItem[]) =>
    items.filter((i) => !isAcked(acks, i.ref, i.lastFed));

  // ── Contatos (CRM) sem interação além do tempo de resfriamento ──────────────
  if (!hidden.has("/pessoas")) {
    const rows = await safeRows<{ id: number; name: string; last_interaction_at: string }>(() =>
      db.select(
        `SELECT id, name, last_interaction_at FROM contacts
          WHERE last_interaction_at IS NOT NULL AND substr(last_interaction_at, 1, 10) < $1`,
        [cutoff]
      )
    );
    const cold = fresh(
      rows.map((r) => ({ ref: `contact:${r.id}`, id: r.id, name: r.name, lastFed: r.last_interaction_at }))
    );
    if (cold.length > 0) {
      const single = cold.length === 1 ? cold[0] : null;
      out.push({
        key: "cooling:contacts",
        icon: "heart",
        to: single ? `/pessoas?open=${single.id}` : "/pessoas",
        critical: false,
        severidade: "info",
        label: single
          ? `${single.name} esfriando: sem contato há +${days} dias`
          : `${cold.length} contatos esfriando: sem contato há +${days} dias`,
        coolingRefs: cold.map((c) => c.ref),
        signature: cold.map((c) => c.ref).sort().join(","),
      });
    }
  }

  // ── Fãs sem interação além do tempo de resfriamento ─────────────────────────
  if (!hidden.has("/fas")) {
    const rows = await safeRows<{ id: number; name: string; last_interaction_at: string }>(() =>
      db.select(
        `SELECT id, name, last_interaction_at FROM fans
          WHERE last_interaction_at IS NOT NULL AND substr(last_interaction_at, 1, 10) < $1`,
        [cutoff]
      )
    );
    const cold = fresh(
      rows.map((r) => ({ ref: `fan:${r.id}`, id: r.id, name: r.name, lastFed: r.last_interaction_at }))
    );
    if (cold.length > 0) {
      const single = cold.length === 1 ? cold[0] : null;
      out.push({
        key: "cooling:fans",
        icon: "heart",
        to: "/fas",
        critical: false,
        severidade: "info",
        label: single
          ? `${single.name} esfriando: sem interação há +${days} dias`
          : `${cold.length} fãs esfriando: sem interação há +${days} dias`,
        coolingRefs: cold.map((c) => c.ref),
        signature: cold.map((c) => c.ref).sort().join(","),
      });
    }
  }

  // ── Faixas em produção sem movimento além do limiar ─────────────────────────
  // "Concluído" = Pós-lançamento (excluído); standby também não conta. Usa
  // updated_at (qualquer edição "alimenta" a faixa), igual aos demais tipos —
  // assim tocar a faixa expira o ack, coerente com o rótulo "sem movimento".
  if (!hidden.has("/musica")) {
    const rows = await safeRows<{ id: number; title: string | null; updated_at: string }>(() =>
      db.select(
        `SELECT id, title_working as title, updated_at FROM tracks
          WHERE standby = 0 AND current_stage != 'Pós-lançamento'
            AND substr(updated_at, 1, 10) < $1`,
        [cutoff]
      )
    );
    const cold = fresh(
      rows.map((r) => ({ ref: `track:${r.id}`, id: r.id, name: r.title || "Sem título", lastFed: r.updated_at }))
    );
    if (cold.length > 0) {
      const single = cold.length === 1 ? cold[0] : null;
      out.push({
        key: "cooling:tracks",
        icon: "music",
        to: "/musica",
        critical: false,
        severidade: "info",
        label: single
          ? `Faixa "${single.name}" esfriando: sem movimento há +${days} dias`
          : `${cold.length} faixas esfriando: sem movimento há +${days} dias`,
        coolingRefs: cold.map((c) => c.ref),
        signature: cold.map((c) => c.ref).sort().join(","),
      });
    }
  }

  // ── Conteúdos em produção sem movimento além do limiar ──────────────────────
  // "Concluído" = Publicado/Arquivado (excluídos).
  if (!hidden.has("/conteudo")) {
    const rows = await safeRows<{ id: number; title: string; updated_at: string }>(() =>
      db.select(
        `SELECT id, title, updated_at FROM content
          WHERE status NOT IN ('Publicado','Arquivado') AND substr(updated_at, 1, 10) < $1`,
        [cutoff]
      )
    );
    const cold = fresh(
      rows.map((r) => ({ ref: `content:${r.id}`, id: r.id, name: r.title, lastFed: r.updated_at }))
    );
    if (cold.length > 0) {
      const single = cold.length === 1 ? cold[0] : null;
      out.push({
        key: "cooling:content",
        icon: "clock",
        to: "/conteudo",
        critical: false,
        severidade: "info",
        label: single
          ? `Conteúdo "${single.name}" esfriando: sem movimento há +${days} dias`
          : `${cold.length} conteúdos esfriando: sem movimento há +${days} dias`,
        coolingRefs: cold.map((c) => c.ref),
        signature: cold.map((c) => c.ref).sort().join(","),
      });
    }
  }

  // ── Festas em planejamento sem movimento além do limiar ─────────────────────
  // "Concluído" = Realizada/Cancelada (excluídas) — só o que ainda está sendo
  // construído esfria.
  if (!hidden.has("/festas")) {
    const rows = await safeRows<{ id: number; title: string; updated_at: string }>(() =>
      db.select(
        `SELECT id, title, updated_at FROM parties
          WHERE status NOT IN ('Realizada','Cancelada') AND substr(updated_at, 1, 10) < $1`,
        [cutoff]
      )
    );
    const cold = fresh(
      rows.map((r) => ({ ref: `party:${r.id}`, id: r.id, name: r.title, lastFed: r.updated_at }))
    );
    if (cold.length > 0) {
      const single = cold.length === 1 ? cold[0] : null;
      out.push({
        key: "cooling:parties",
        icon: "party",
        to: "/festas",
        critical: false,
        severidade: "info",
        label: single
          ? `Festa "${single.name}" esfriando: sem movimento há +${days} dias`
          : `${cold.length} festas esfriando: sem movimento há +${days} dias`,
        coolingRefs: cold.map((c) => c.ref),
        signature: cold.map((c) => c.ref).sort().join(","),
      });
    }
  }

  // ── Ideias esfriando — filtradas pelo CALOR mínimo (ideias têm calor 1–3) ────
  // Só ideias com calor >= o limiar configurado entram; sem movimento além do
  // tempo de resfriamento. (Ideias não é um módulo ocultável do Perfil.)
  {
    const rows = await safeRows<{ id: number; title: string | null; updated_at: string }>(() =>
      db.select(
        `SELECT id, title, updated_at FROM ideas
          WHERE heat >= $1 AND substr(updated_at, 1, 10) < $2`,
        [heatMin, cutoff]
      )
    );
    const cold = fresh(
      rows.map((r) => ({ ref: `idea:${r.id}`, id: r.id, name: r.title || "Sem título", lastFed: r.updated_at }))
    );
    if (cold.length > 0) {
      const single = cold.length === 1 ? cold[0] : null;
      out.push({
        key: "cooling:ideas",
        icon: "flame",
        to: single ? `/ideias?open=${single.id}` : `/ideias?open=${cold[0].id}`,
        critical: false,
        severidade: "info",
        label: single
          ? `Ideia "${single.name}" esfriando: sem movimento há +${days} dias`
          : `${cold.length} ideias esfriando: sem movimento há +${days} dias`,
        coolingRefs: cold.map((c) => c.ref),
        signature: cold.map((c) => c.ref).sort().join(","),
      });
    }
  }

  return out;
}
