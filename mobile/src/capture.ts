import { supabase } from "./supabase";

/** Envia uma captura aditiva pro desktop revisar (fundir/descartar). */
export async function sendCapture(kind: string, payload: Record<string, unknown>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("capture_inbox").insert({
    user_id: u.user?.id,
    kind,
    client_ref: crypto.randomUUID(),
    payload,
  });
  if (error) throw error;
}
