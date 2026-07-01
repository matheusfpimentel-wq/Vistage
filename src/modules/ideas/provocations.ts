import { formatDate, toLocalISODate } from "@/lib/format";
import { getDb } from "@/lib/db";
import { persistDocSetting } from "@/lib/docSettings";
import { isModuleVisible } from "@/lib/moduleVisibility";
import { listOkrs, okrProgress } from "@/modules/objetivos/api";
import { listTasks } from "@/modules/tasks/api";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { parseDebriefItems } from "@/modules/gigs/debriefItems";
import { loadSwot } from "@/modules/dashboard/methodologies";
import { listIdeas } from "./api";

/**
 * "Provocações" do dado de insights: junta dados espalhados pelo app e sorteia um
 * deles pra provocar conexões no brainstorm. Cada item tem uma `key` estável pra
 * poder ser ocultado/restaurado. Os que vêm dos SEUS dados (OKR, SWOT, ideia,
 * debrief de GIG…) são `deletable`: podem ser excluídos de vez. As provocações
 * perenes (built-in) só podem ser ocultadas/mostradas. A gestão fica em
 * Configurações → Insights; aqui só a fonte de dados.
 */
/** derivada-de-dado (vem do seu material) vs genérica (perene/built-in). */
export type InsightKind = "derived" | "generic";
export type RawInsight = { key: string; text: string; deletable: boolean; kind: InsightKind };

// Persiste no .vistage (prefixo vistage.filter.* é hidratado ao abrir o doc).
export const DISMISS_KEY = "vistage.filter.insightDie.dismissed";
export const DELETED_KEY = "vistage.filter.insightDie.deleted";
export const PINNED_KEY = "vistage.filter.insightDie.pinned";
export const SNOOZE_KEY = "vistage.filter.insightDie.snooze";

export function loadSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSet(storageKey: string, set: Set<string>) {
  persistDocSetting(storageKey, JSON.stringify([...set]));
}

/** Sonecas: mapa key→ISO de até quando a provocação fica oculta. Portátil. */
export function loadSnooze(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function saveSnooze(map: Record<string, string>) {
  persistDocSetting(SNOOZE_KEY, JSON.stringify(map));
}

/** Adia uma provocação por N dias (grava o "até quando"). */
export function snoozeInsight(key: string, days: number) {
  const map = loadSnooze();
  const until = new Date(Date.now() + days * 86400000).toISOString();
  map[key] = until;
  saveSnooze(map);
}

/** Keys com soneca ATIVA (até no futuro). Expirados são ignorados na leitura. */
export function activeSnoozeKeys(): Set<string> {
  const map = loadSnooze();
  const now = Date.now();
  const active = new Set<string>();
  for (const [k, until] of Object.entries(map)) {
    const t = Date.parse(until);
    if (!Number.isNaN(t) && t > now) active.add(k);
  }
  return active;
}

// Provocações perenes — garantem variedade mesmo com pouco dado cadastrado.
export const EVERGREEN: string[] = [
  "Se você só pudesse tocar em 1 lugar neste mês, qual seria — e por quê?",
  "Qual som/transição te marcou na última GIG? Dá pra virar marca registrada?",
  "Que colaboração (DJ, produtor, marca) abriria mais portas agora?",
  "O que no seu set ninguém mais faz? Como deixar isso mais óbvio pro público?",
  "Qual conteúdo de 15s sairia da sua próxima GIG quase pronto?",
  "Que tarefa você vem adiando há semanas? Qual o menor passo possível hoje?",
  "Se dobrasse seu cachê médio, o que precisaria ser verdade antes?",
  "Qual cidade/casa você ainda não tocou e faz sentido mirar?",
];

/** Gera TODAS as provocações possíveis (sem filtrar ocultas/excluídas). */
export async function generateRaw(): Promise<RawInsight[]> {
  const today = toLocalISODate();
  const out: RawInsight[] = [];
  // Derivadas-de-dado por padrão (vêm do seu material); só as perenes são 'generic'.
  const add = (key: string, text: string, deletable: boolean, kind: InsightKind = "derived") =>
    out.push({ key, text, deletable, kind });

  try {
    const okrs = await listOkrs();
    for (const o of okrs) {
      const pct = Math.round(okrProgress(o) * 100);
      add(`okr:${o.id}`, `OKR "${o.objective}" está em ${pct}%. O que destravaria os próximos 10%?`, true);
    }
  } catch { /* ignore */ }

  try {
    const swot = await loadSwot();
    for (const s of swot.strengths) add(`swot:s:${s}`, `Força: ${s}. Como amplificar?`, true);
    for (const w of swot.weaknesses) add(`swot:w:${w}`, `Fraqueza: ${w}. Qual o menor passo pra corrigir?`, true);
    for (const o of swot.opportunities) add(`swot:o:${o}`, `Oportunidade: ${o}. Vale agir agora?`, true);
    for (const t of swot.threats) add(`swot:t:${t}`, `Ameaça: ${t}. Como mitigar?`, true);
  } catch { /* ignore */ }

  try {
    const tasks = await listTasks();
    const urgent = tasks.filter((t) => t.status !== "Concluída" && t.eisenhower_quadrant === "do");
    if (urgent.length > 0) {
      const sample = urgent[Math.floor(Math.random() * urgent.length)];
      add(`eisenhower:${sample.id}`, `Tarefa urgente e importante: "${sample.title}". Dá pra resolver hoje?`, true);
    }
  } catch { /* ignore */ }

  try {
    // Ideias genuinamente quentes AGORA (Calor efetivo, já com o decaimento),
    // fora arquivadas/prontas. (Antes filtrava heat=3 exato — morna, não quente.)
    const all = await listIdeas();
    const hot = all.filter(
      (i) =>
        (i.currentHeat ?? i.heat) >= 4 &&
        i.maturation !== "Arquivada" &&
        i.maturation !== "Pronta"
    );
    for (const i of hot.slice(0, 8)) {
      add(`idea:${i.id}`, `Ideia quente: "${i.title}". Que primeiro passo a tornaria real?`, true);
    }
  } catch { /* ignore */ }

  // Provocações derivadas de GIGs só fazem sentido com o módulo GIGs visível
  // (Perfil). Oculto → pula (weakagg/fancool abaixo NÃO dependem de /gigs).
  if (isModuleVisible("/gigs")) {
    try {
      const gigs = await listGigs();
      const upcoming = gigs
        .filter((g) => g.date >= today && g.status !== "Cancelada")
        .sort((a, b) => a.date.localeCompare(b.date));
      if (upcoming[0]) {
        add(`gig-next:${upcoming[0].id}`, `Próxima GIG: ${gigDisplayName(upcoming[0])} em ${formatDate(upcoming[0].date)}. Algo a preparar?`, true);
      }
      const recent = gigs
        .filter((g) => g.status === "Concluída")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12);
      for (const g of recent) {
        const where = gigDisplayName(g);
        for (const [idx, item] of parseDebriefItems(g.debrief_weaknesses).entries()) {
          add(`gig-weak:${g.id}:${idx}`, `Dificuldade em ${where}: ${item.text}. Como evitar na próxima?`, true);
        }
        const learn = (g.debrief_learnings ?? "").trim();
        if (learn) add(`gig-learn:${g.id}`, `Aprendizado de ${where}: ${learn}. Como aplicar de novo?`, true);
      }
    } catch { /* ignore */ }
  }

  // §5 Modo Foco (agregado): pontos fracos marcados ao vivo no último mês viram
  // uma provocação por TIPO recorrente — o erro repetido pede uma ideia que o resolva.
  try {
    const rows = await getDb().select<{ tipo: string; n: number }[]>(
      `SELECT tipo, COUNT(*) AS n FROM performance_weak_points
        WHERE tipo IS NOT NULL AND tipo != '' AND created_at >= date('now','-30 days')
        GROUP BY tipo HAVING n >= 2 ORDER BY n DESC`
    );
    for (const r of rows) {
      add(
        `weakagg:${r.tipo}`,
        `Você marcou ${r.n}× "${r.tipo}" no Modo Foco no último mês — que ideia resolve isso de vez?`,
        true
      );
    }
  } catch { /* ignore */ }

  // §5 Fã esfriando: superfã/embaixador sem contato faz tempo vira semente —
  // relacionamento que esfria pede uma ideia que reaproxime.
  try {
    const fans = await getDb().select<{ id: number; name: string; days: number }[]>(
      `SELECT id, name, CAST(julianday('now') - julianday(last_interaction_at) AS INTEGER) AS days
         FROM fans
        WHERE last_interaction_at IS NOT NULL
          AND level IN ('Superfã', 'Embaixador')
          AND julianday('now') - julianday(last_interaction_at) >= 45
        ORDER BY days DESC LIMIT 5`
    );
    for (const f of fans) {
      add(
        `fancool:${f.id}`,
        `${f.name} é um superfã, mas faz ${f.days} dias sem contato. Que ideia te reaproxima?`,
        true
      );
    }
  } catch { /* ignore */ }

  // provocações perenes (built-in) — não deletáveis, só ocultáveis. Genéricas:
  // entram atrás das derivadas-de-dado no ranking do banner.
  EVERGREEN.forEach((text, i) => add(`evergreen:${i}`, text, false, "generic"));

  return out;
}
