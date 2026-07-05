import { localISO, localToday } from "./dates";

/**
 * Marcações otimistas do celular (Recebido/Dada/feito/concluída) persistidas no
 * aparelho. O espelho só deixa de listar o item quando o PC ingere a captura —
 * até lá, sem isso, o card REAPARECIA a cada visita e um segundo toque gerava
 * captura duplicada (outreach_done duplicaria a interação no CRM e no OKR).
 * Formato: { [id]: "YYYY-MM-DD" } com GC por idade (o PC ingere muito antes).
 */

type AckedMap = Record<string, string>;

function readMap(key: string, maxAgeDays: number): AckedMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const m = JSON.parse(raw) as unknown;
    if (!m || typeof m !== "object") return {};
    const floor = new Date();
    floor.setDate(floor.getDate() - maxAgeDays);
    const floorISO = localISO(floor);
    const out: AckedMap = {};
    for (const [id, at] of Object.entries(m as AckedMap)) {
      if (typeof at === "string" && at >= floorISO) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/** Ids marcados (já sem os expirados). */
export function readAcked(key: string, maxAgeDays = 30): Set<string> {
  return new Set(Object.keys(readMap(key, maxAgeDays)));
}

/** Marca um id (persistente) e devolve o conjunto atualizado. */
export function addAcked(key: string, id: string, maxAgeDays = 30): Set<string> {
  const m = readMap(key, maxAgeDays);
  m[id] = localToday();
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    /* storage indisponível — segue só em memória */
  }
  return new Set(Object.keys(m));
}

/** Desfaz uma marcação (ex.: a captura nem chegou a ser enfileirada). */
export function removeAcked(key: string, id: string, maxAgeDays = 30): Set<string> {
  const m = readMap(key, maxAgeDays);
  delete m[id];
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    /* storage indisponível */
  }
  return new Set(Object.keys(m));
}
