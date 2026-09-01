// send-push — envia web-push do resumo do dia.
// Auth própria (verify_jwt=false):
//  • header x-cron-secret = cron_secret  → modo diário: todos os inscritos.
//  • Authorization: Bearer <jwt do usuário> → manual/teste: só aquele usuário.
//
// Segredos (VAPID, cron) ficam na tabela app_secrets (somente service_role).
// Deploy via Supabase MCP/CLI. NÃO contém segredos.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Fuso do dono do app. O resumo é sobre o DIA DELE, não sobre o dia UTC do
// servidor — sem isso um show às 22h (02h UTC do dia seguinte) some da lista.
const TZ = "America/Sao_Paulo";

/** Data de hoje NO FUSO LOCAL (en-CA formata como YYYY-MM-DD). */
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Offset local ("-03:00") pra fechar a janela do dia em timestamptz. Fallback
 *  no horário de Brasília se o runtime não tiver `longOffset`. */
function tzOffset(): string {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
      .format(new Date());
    return s.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "-03:00";
  } catch {
    return "-03:00";
  }
}

/** "22:00" no fuso local, a partir do timestamptz. */
function hhmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    .format(d);
}

async function getSecrets(): Promise<Record<string, string>> {
  const { data } = await admin.from("app_secrets").select("key, value");
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[(r as { key: string }).key] = (r as { value: string }).value;
  return m;
}

async function buildSummary(userId: string): Promise<{ title: string; body: string }> {
  const today = todayISO();
  const off = tzOffset();
  const { data: agenda } = await admin
    .from("agenda_mirror")
    .select("source, title, start_at")
    .eq("user_id", userId)
    .gte("start_at", `${today}T00:00:00${off}`)
    .lte("start_at", `${today}T23:59:59${off}`)
    .order("start_at");
  const { data: contacts } = await admin
    .from("contact_today").select("name").eq("user_id", userId).limit(3);
  const items = (agenda ?? []) as { source: string; title: string; start_at: string | null }[];
  const gigs = items.filter((i) => i.source === "gig");
  const tasks = items.filter((i) => i.source === "task");
  const follow = (contacts ?? []) as { name: string }[];
  const parts: string[] = [];
  if (gigs.length) parts.push(`${gigs.length} GIG${gigs.length > 1 ? "s" : ""}`);
  if (tasks.length) parts.push(`${tasks.length} tarefa${tasks.length > 1 ? "s" : ""}`);
  if (follow.length) parts.push(`${follow.length} esfriando`);
  const title = parts.length ? `Hoje: ${parts.join(", ")}` : "Resumo do dia";
  // Hora na frente do item: sem ela a lista não diz nada acionável de manhã.
  // Meia-noite = "sem hora" no espelho (tarefa por vencimento, show sem horário
  // definido) e vira só o título, nunca um "00:00" que não quer dizer nada.
  const body = items.length
    ? items.slice(0, 4).map((i) => {
        const h = hhmm(i.start_at);
        return h && h !== "00:00" ? `${h} ${i.title}` : i.title;
      }).join(" · ")
    : "Nada marcado pra hoje.";
  return { title, body };
}

async function sendToUser(userId: string, vapid: { pub: string; priv: string; sub: string }): Promise<number> {
  const { data: subs } = await admin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs || !subs.length) return 0;
  const summary = await buildSummary(userId);
  webpush.setVapidDetails(vapid.sub, vapid.pub, vapid.priv);
  let sent = 0;
  for (const s of subs as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: summary.title, body: summary.body, url: "/", tag: "resumo-diario" }),
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secrets = await getSecrets();
    const vapid = { pub: secrets.vapid_public, priv: secrets.vapid_private, sub: secrets.vapid_subject ?? "mailto:admin@vistage.app" };
    if (!vapid.pub || !vapid.priv) return json({ error: "VAPID não configurado" }, 500);

    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret) {
      if (!secrets.cron_secret || cronSecret !== secrets.cron_secret) return json({ error: "cron secret inválido" }, 401);
      const { data: rows } = await admin.from("push_subscriptions").select("user_id");
      const uids = [...new Set(((rows ?? []) as { user_id: string }[]).map((r) => r.user_id))];
      let total = 0;
      for (const uid of uids) total += await sendToUser(uid, vapid);
      return json({ ok: true, mode: "cron", users: uids.length, sent: total });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "sem autenticação" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "não autenticado" }, 401);
    const sent = await sendToUser(user.id, vapid);
    return json({ ok: true, mode: "manual", sent });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
