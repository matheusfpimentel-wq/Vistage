import { supabase } from "./supabase";

/**
 * Upload de mídia da captura (voz/foto) pro bucket privado `captures` do relay.
 * Cada usuário só enxerga a própria pasta (`captures/{uid}/...`, RLS). Devolve o
 * caminho (key) salvo no payload da captura — o desktop baixa por ele e grava
 * em uploadsDir. Requer internet no momento da captura (o áudio/foto não cabe
 * na fila offline em texto).
 */
export const CAPTURES_BUCKET = "captures";

/** Extensão do arquivo a partir do MIME (pro nome no bucket). */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "video/webm": "webm",
    "video/mp4": "mp4",
  };
  return map[mime] ?? (mime.startsWith("audio/") ? "webm" : "bin");
}

/** Sobe o blob e devolve o caminho no bucket, ou lança (ex.: offline). */
export async function uploadCaptureMedia(blob: Blob, mime: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Sem sessão.");
  const path = `${uid}/${crypto.randomUUID()}.${extFromMime(mime)}`;
  const { error } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}
