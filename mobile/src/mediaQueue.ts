// §5 — fila OFFLINE-FIRST de mídia (foto/clipe da GIG). Diferente da fila de
// texto (queue.ts), aqui o corpo é binário, então o blob mora no IndexedDB até
// conseguir subir. O fluxo por item: (1) sobe o blob pro bucket do relay
// (Storage), (2) insere a captura `gig_media` no capture_inbox só com a
// referência (path), (3) apaga o blob local. Tudo idempotente: o upload é
// upsert (mesmo path) e o insert deduplica por client_ref — reexecutar é seguro.

import { supabase } from "./supabase";

const DB_NAME = "vistage-media";
const STORE = "queue";
const RELAY_BUCKET = "gig-media";

export type MediaItem = {
  client_ref: string;
  blob: Blob;
  gig_id: number | null;
  media_kind: "photo" | "clip";
  ext: string;
  mime: string;
  caption: string | null;
  captured_at: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "client_ref" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

async function putItem(item: MediaItem): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
}
async function allItems(): Promise<MediaItem[]> {
  return (await tx<MediaItem[]>("readonly", (s) => s.getAll())) ?? [];
}
async function deleteItem(ref: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(ref));
}

/** Guarda o item na fila (durável) e tenta subir na hora. Nunca lança. */
export async function enqueueMedia(
  input: Omit<MediaItem, "client_ref" | "captured_at"> & { captured_at?: string }
): Promise<void> {
  const item: MediaItem = {
    ...input,
    client_ref: crypto.randomUUID(),
    captured_at: input.captured_at ?? new Date().toISOString(),
  };
  await putItem(item);
  void flushMediaQueue();
}

let flushing = false;

/** Sobe o que dá; para no primeiro erro (offline) e mantém o resto na fila. */
export async function flushMediaQueue(): Promise<{ sent: number; pending: number }> {
  if (flushing) return { sent: 0, pending: 0 };
  flushing = true;
  let sent = 0;
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return { sent: 0, pending: (await allItems()).length };

    const items = await allItems();
    for (const it of items) {
      const path = `${uid}/${it.client_ref}.${it.ext}`;
      const up = await supabase.storage
        .from(RELAY_BUCKET)
        .upload(path, it.blob, { contentType: it.mime, upsert: true });
      if (up.error) break; // rede/erro — mantém na fila pra tentar depois

      const { error: insErr } = await supabase.from("capture_inbox").upsert(
        {
          user_id: uid,
          kind: "gig_media",
          client_ref: it.client_ref,
          payload: {
            gig_id: it.gig_id,
            storage_path: path,
            media_kind: it.media_kind,
            ext: it.ext,
            mime: it.mime,
            caption: it.caption,
            captured_at: it.captured_at,
          },
        },
        { onConflict: "user_id,client_ref", ignoreDuplicates: true }
      );
      if (insErr) break; // deixa o blob na fila; o upsert acima já é idempotente

      await deleteItem(it.client_ref);
      sent++;
    }
  } catch {
    /* silencioso: tenta de novo no próximo gatilho */
  } finally {
    flushing = false;
  }
  return { sent, pending: (await allItems().catch(() => [])).length };
}

/** Quantos itens de mídia ainda esperam upload (pro rótulo "enviando…"). */
export async function pendingMediaCount(): Promise<number> {
  try {
    return (await allItems()).length;
  } catch {
    return 0;
  }
}
