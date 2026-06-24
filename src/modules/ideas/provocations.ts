import { formatDate, toLocalISODate } from "@/lib/format";
import { persistDocSetting } from "@/lib/docSettings";
import { listOkrs, okrProgress } from "@/modules/objetivos/api";
import { listTasks } from "@/modules/tasks/api";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
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
export type RawInsight = { key: string; text: string; deletable: boolean };

// Persiste no .vistage (prefixo vistage.filter.* é hidratado ao abrir o doc).
export const DISMISS_KEY = "vistage.filter.insightDie.dismissed";
export const DELETED_KEY = "vistage.filter.insightDie.deleted";

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
  const add = (key: string, text: string, deletable: boolean) =>
    out.push({ key, text, deletable });

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
    const hot = await listIdeas({ heat: 3 });
    for (const i of hot.slice(0, 8)) {
      add(`idea:${i.id}`, `Ideia quente: "${i.title}". Que primeiro passo a tornaria real?`, true);
    }
  } catch { /* ignore */ }

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
      for (const [idx, line] of (g.debrief_weaknesses ?? "")
        .split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
        add(`gig-weak:${g.id}:${idx}`, `Dificuldade em ${where}: ${line} — como evitar na próxima?`, true);
      }
      const learn = (g.debrief_learnings ?? "").trim();
      if (learn) add(`gig-learn:${g.id}`, `Aprendizado de ${where}: ${learn}. Como aplicar de novo?`, true);
    }
  } catch { /* ignore */ }

  // provocações perenes (built-in) — não deletáveis, só ocultáveis
  EVERGREEN.forEach((text, i) => add(`evergreen:${i}`, text, false));

  return out;
}
