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

/**
 * Sessão "portátil" que viaja DENTRO do .vistage — só o suficiente pra
 * reconectar o mesmo usuário de sincronização numa máquina nova sem digitar a
 * senha de novo. O refresh_token é o que importa (o access_token expira em
 * minutos e é renovado a partir do refresh). É uma credencial: por isso o
 * arquivo .vistage carrega um aviso de "não compartilhe".
 */
export type PortableSession = {
  refresh_token: string;
  access_token: string;
  email?: string | null;
};

/** Captura a sessão atual do Supabase pra embutir no documento (ou null). */
export async function getPortableSession(): Promise<PortableSession | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s?.refresh_token || !s.access_token) return null;
    return {
      refresh_token: s.refresh_token,
      access_token: s.access_token,
      email: s.user?.email ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Reestabelece a sessão de sincronização a partir do que veio no .vistage.
 * Não sobrescreve um login já ativo nesta máquina. Retorna true se reconectou.
 */
export async function restorePortableSession(
  sess: PortableSession | null | undefined
): Promise<boolean> {
  if (!sess?.refresh_token || !sess.access_token) return false;
  try {
    // Já há login ativo aqui? Respeita a sessão local — não troca de conta.
    const { data } = await supabase.auth.getSession();
    if (data.session) return false;
    const { error } = await supabase.auth.setSession({
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
    });
    return !error;
  } catch {
    return false;
  }
}
