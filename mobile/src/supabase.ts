import { createClient } from "@supabase/supabase-js";

// Mesma config pública do desktop (protegida por RLS). Cada DJ loga na própria
// conta; o RLS isola as bases.
const SUPABASE_URL = "https://opvctbxzlwpyrvutfazb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FgK4RH_92x4IATgvVVEqGg_MQxBlpxw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
