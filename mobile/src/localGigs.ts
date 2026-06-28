import { storeGet, storeSet } from "./native";

/**
 * GIGs criadas no celular ficam VISÍVEIS na hora (otimista), sem esperar o PC.
 *
 * O mobile é um espelho de leitura: uma GIG capturada vira item da `capture_inbox`
 * e só aparece nas listas depois que o PC a processa e reescreve o espelho
 * (catalog_mirror/agenda_mirror). Pra não "sumir até abrir o PC", guardamos a GIG
 * localmente aqui e as telas (Buscar, Hoje) mesclam as pendentes com as do espelho.
 *
 * Reconciliação: quando a GIG real chega no espelho (mesma data + nome da casa no
 * texto de busca), removemos a local — sem duplicar. GC por idade evita lixo se o
 * PC demorar muito a processar.
 */

const KEY = "vistage.gigs.local.v1";
const MAX_AGE_DAYS = 45;

export type LocalGig = {
  client_ref: string;
  venue_name: string;
  date: string | null; // YYYY-MM-DD
  city: string | null;
  cache_amount: number | null;
  notes: string | null;
  created_at: string; // ISO
};

async function read(): Promise<LocalGig[]> {
  const raw = await storeGet(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalGig[]) : [];
  } catch {
    return [];
  }
}

async function write(list: LocalGig[]): Promise<void> {
  await storeSet(KEY, JSON.stringify(list));
}

/** Guarda uma GIG criada no celular pra aparecer já (antes do PC processar). */
export async function addLocalGig(g: {
  venue_name: string;
  date: string | null;
  city: string | null;
  cache_amount: number | null;
  notes: string | null;
}): Promise<void> {
  const list = await read();
  list.push({
    client_ref: crypto.randomUUID(),
    venue_name: g.venue_name,
    date: g.date,
    city: g.city,
    cache_amount: g.cache_amount,
    notes: g.notes,
    created_at: new Date().toISOString(),
  });
  await write(list);
}

/** GIGs locais ainda pendentes (com GC por idade — some sozinha depois de um tempo). */
export async function listLocalGigs(): Promise<LocalGig[]> {
  const list = await read();
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = list.filter((g) => {
    const t = new Date(g.created_at).getTime();
    return isNaN(t) || t >= cutoff;
  });
  if (fresh.length !== list.length) await write(fresh);
  return fresh;
}

/**
 * Remove as GIGs locais que já apareceram no espelho (o PC processou). Casa por
 * data + nome da casa presente no `hay` (search_text/título do espelho). Devolve
 * as que continuam pendentes. Idempotente.
 */
export async function reconcileLocalGigs(
  mirror: { date: string | null; hay: string }[]
): Promise<LocalGig[]> {
  const list = await listLocalGigs();
  if (list.length === 0) return [];
  const kept = list.filter((g) => {
    const v = g.venue_name.trim().toLowerCase();
    if (!v) return true;
    return !mirror.some((m) => m.date === g.date && m.hay.includes(v));
  });
  if (kept.length !== list.length) await write(kept);
  return kept;
}
