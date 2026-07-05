import { supabase } from "./supabase";
import { storeGet, storeSet } from "./native";

/**
 * Fila offline-first de capturas. Toda captura é PRIMEIRO gravada localmente
 * (storage durável — nativo no app, localStorage no PWA) e só então tenta subir
 * pro `capture_inbox`. Se estiver offline (ou deslogado), fica na fila e sobe no
 * próximo flush (online / volta ao app / próximo envio). Fechar/recarregar não
 * perde nada — é o requisito da captura ao vivo no set.
 */

const KEY = "vistage.capture.queue.v1";

export type QueuedCapture = {
  client_ref: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

async function readQueue(): Promise<QueuedCapture[]> {
  const raw = await storeGet(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedCapture[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(q: QueuedCapture[]): Promise<void> {
  await storeSet(KEY, JSON.stringify(q));
}

let flushing = false;

/** Enfileira uma captura (durável) e tenta subir já (best-effort). */
export async function enqueueCapture(kind: string, payload: Record<string, unknown>): Promise<void> {
  const q = await readQueue();
  q.push({ client_ref: crypto.randomUUID(), kind, payload, created_at: new Date().toISOString() });
  await writeQueue(q);
  void flushQueue();
}

/**
 * Tenta subir tudo que está na fila. Para no primeiro erro de rede (mantém o
 * resto enfileirado). Remove da fila só o que foi confirmado. Reentrância
 * protegida (`flushing`). Devolve quantos subiram e quantos sobraram.
 */
export async function flushQueue(): Promise<{ sent: number; pending: number }> {
  if (flushing) return { sent: 0, pending: (await readQueue()).length };
  flushing = true;
  try {
    const q = await readQueue();
    if (q.length === 0) return { sent: 0, pending: 0 };

    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return { sent: 0, pending: q.length }; // deslogado — tenta depois

    const sent = new Set<string>();
    for (const c of q) {
      // upsert idempotente: se um flush anterior gravou no servidor mas o app
      // caiu/perdeu a resposta antes de limpar a fila, o reenvio do MESMO
      // client_ref não pode virar erro de duplicado — senão o item entala na
      // cabeça da fila e bloqueia tudo atrás pra sempre.
      const { error } = await supabase.from("capture_inbox").upsert(
        {
          user_id: uid,
          kind: c.kind,
          client_ref: c.client_ref,
          payload: c.payload,
        },
        { onConflict: "user_id,client_ref", ignoreDuplicates: true }
      );
      if (error) break; // rede/RLS — para e mantém o resto na fila
      sent.add(c.client_ref);
    }

    if (sent.size > 0) {
      const remaining = (await readQueue()).filter((c) => !sent.has(c.client_ref));
      await writeQueue(remaining);
      return { sent: sent.size, pending: remaining.length };
    }
    return { sent: 0, pending: q.length };
  } finally {
    flushing = false;
  }
}

/** Quantas capturas ainda não subiram (pra status "sincroniza sozinho"). */
export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}
