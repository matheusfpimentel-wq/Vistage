import { createClient, type Session, type User } from "@supabase/supabase-js";
import { decryptSyncSecret } from "./crypto";

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
  /**
   * Senha de sync CIFRADA (opt-in "manter login em qualquer PC"). Presente só se
   * o usuário pediu explicitamente. Diferente dos tokens, a senha NÃO expira nem
   * rotaciona — por isso reconecta numa máquina nova com um signInWithPassword
   * limpo (sem o fork de refresh_token entre PCs que derrubava a sessão). É
   * cifrada (crypto.encryptSyncSecret), mas veja o aviso lá: é ofuscação, não
   * sigilo — a proteção real é criptografar o .vistage inteiro. Ausente = o
   * usuário optou por NÃO guardar a senha (padrão), só a sessão portátil viaja. */
  secret?: string | null;
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
 * arquivo": a conta ativa segue o .vistage aberto. Tenta, em ordem: (1) manter a
 * sessão VIVA se já for da mesma conta; (2) adotar os TOKENS do arquivo se ainda
 * valerem; (3) — só se o usuário optou por "manter login em qualquer PC" — logar
 * com a SENHA cifrada guardada no arquivo (cobre máquina nova e tokens vencidos:
 * a senha não rotaciona, então o login é limpo e independente). Se nada disso
 * der, fica deslogado e o usuário loga à mão. Retorna true se conectou.
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
    let signedOut = false;

    // 1) Já logado na MESMA conta que o arquivo quer (ou o arquivo não traz
    //    conta): mantém a sessão viva — é a mais fresca. Nada de deslogar pra
    //    recolocar uma cópia mais velha.
    if (curEmail && (!sess?.email || curEmail === sess.email)) {
      return true;
    }

    // 2) Tokens do arquivo ainda válidos → adota direto (sem round-trip de
    //    login). Se havia outra conta viva, sai antes ("uma conta por arquivo").
    if (fileValid) {
      if (curEmail) {
        await supabase.auth.signOut().catch(() => {});
        signedOut = true;
      }
      const { error } = await supabase.auth.setSession({
        access_token: sess!.access_token,
        refresh_token: sess!.refresh_token,
      });
      if (!error) return true;
      // Token velho (rotacionado/revogado numa máquina nova) → tenta a senha.
    }

    // 3) Sem sessão utilizável, mas o arquivo GUARDA a senha (opt-in explícito):
    //    login limpo. É o que faz "abrir já logado" funcionar numa MÁQUINA NOVA —
    //    signInWithPassword cria uma sessão independente, sem herdar (nem forkar)
    //    o refresh_token do arquivo.
    if (sess?.secret && sess.email) {
      const pw = await decryptSyncSecret(sess.secret, sess.email);
      if (pw) {
        if (curEmail && curEmail !== sess.email && !signedOut) {
          await supabase.auth.signOut().catch(() => {});
          signedOut = true;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: sess.email,
          password: pw,
        });
        if (!error) return true;
      }
    }

    // 4) Nada funcionou: não inventa estado. Se derrubamos a conta anterior por
    //    causa do "uma conta por arquivo", segue deslogado; senão, o que houver.
    return !!curEmail && !signedOut;
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
