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

/** Troca a senha do usuário logado (Supabase Auth). Exige sessão ativa. */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
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
  /** Epoch ms de quando a sessão foi capturada (p/ o TTL). Opcional: arquivos
   *  .vistage antigos não têm — seguem válidos até a próxima gravação. */
  captured_at?: number;
};

/** Sessão portátil só vale 90 dias desde a captura — defense-in-depth: um
 *  .vistage vazado não dá login de sync pra sempre. */
export const PORTABLE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
      captured_at: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * ADOTA a conta de sync DO ARQUIVO recém-aberto — modelo "uma conta por
 * arquivo": a conta ativa segue o .vistage aberto, não a máquina. SEMPRE desloga
 * a conta anterior — a de outro arquivo — e entra na deste. Se o arquivo não
 * carrega sessão (nunca sincronizou) ou ela expirou, fica DESLOGADO: o usuário
 * loga de novo pra vincular este arquivo a uma conta. Retorna true se conectou.
 */
export async function adoptPortableSession(
  sess: PortableSession | null | undefined
): Promise<boolean> {
  const expired =
    !!sess?.captured_at && Date.now() - sess.captured_at > PORTABLE_SESSION_TTL_MS;
  const fileValid = !!sess?.refresh_token && !!sess.access_token && !expired;
  try {
    // Sessão VIVA da máquina (persistida no webview). Costuma estar MAIS FRESCA
    // que o snapshot do arquivo: enquanto o app roda, o Supabase rotaciona o
    // refresh_token, então o que ficou gravado no .vistage no último "Salvar"
    // pode já estar velho. Preferir a sessão viva é o que faz "abrir já logado"
    // funcionar no mesmo PC — antes um signOut() cego derrubava ela e punha a
    // do arquivo (com access_token expirado + refresh rotacionado) → logout.
    const { data: cur } = await supabase.auth.getSession();
    const curEmail = cur.session?.user?.email ?? null;

    // Já logado na MESMA conta que o arquivo quer (ou o arquivo não traz conta):
    // mantém a sessão viva. Nada de deslogar pra recolocar uma cópia mais velha.
    if (curEmail && (!sess?.email || curEmail === sess.email)) {
      return true;
    }

    // Arquivo sem sessão utilizável (nunca sincronizou / expirou o TTL): não
    // desloga a máquina à toa — segue com a sessão que houver (ou nenhuma).
    if (!fileValid) return !!curEmail;

    // Conta DIFERENTE no arquivo → troca de fato ("uma conta por arquivo").
    await supabase.auth.signOut().catch(() => {});
    const { error } = await supabase.auth.setSession({
      access_token: sess!.access_token,
      refresh_token: sess!.refresh_token,
    });
    return !error;
  } catch {
    return false;
  }
}

// ── Relay de mídia (Storage) — §5 ────────────────────────────────────────────
// Ponte EFÊMERA pra mídia da GIG: o celular sobe a foto/clipe comprimido pro
// bucket; o PC baixa na revisão de capturas, grava em uploads/ e APAGA o objeto
// (o relay não guarda mídia — só transporta). Bucket privado, RLS por auth.uid().
// O provisionamento (bucket + policies) mora no supabase/schema.sql.
export const RELAY_MEDIA_BUCKET = "gig-media";

/** Baixa o objeto do relay como bytes (ou null se falhar/expirou). */
export async function relayDownload(path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage
      .from(RELAY_MEDIA_BUCKET)
      .download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Apaga objetos do relay (best-effort — o transporte já cumpriu seu papel). */
export async function relayRemove(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await supabase.storage.from(RELAY_MEDIA_BUCKET).remove(paths);
  } catch {
    /* best-effort: objeto órfão é limpo depois; não trava a ingestão */
  }
}
