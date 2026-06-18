import { createClient, type Session, type User } from "@supabase/supabase-js";

// Config PÚBLICA do projeto Vistage na nuvem (protegida por RLS). É a mesma para
// todos os DJs — cada um faz login na PRÓPRIA conta e o RLS isola as bases.
// Por serem chaves públicas (anon/publishable), podem ficar no código do app.
const SUPABASE_URL = "https://opvctbxzlwpyrvutfazb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FgK4RH_92x4IATgvVVEqGg_MQxBlpxw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, // guarda a sessão (refresh token) no storage do webview
    autoRefreshToken: true,
    detectSessionInUrl: false, // app desktop, sem redirect de URL
  },
});

export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}
