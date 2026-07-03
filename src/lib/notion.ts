import { fetch } from "@tauri-apps/plugin-http";
import { getDb } from "./db";
import { emitDataChanged } from "./events";

/**
 * Integração com o Notion — 1 VIA (Vistage → Notion). O Vistage cria um
 * database "Ideias" no Notion (sob uma página que você compartilha com a
 * integração) e empurra cada ideia como uma página desse database. Espelha as
 * convenções do Todoist: token guardado em app_settings (viaja no .vistage),
 * sync no "Salvar" e por botão, último sync mostrado.
 *
 * Usa o fetch do plugin HTTP do Tauri (passa pela camada Rust) — o fetch nativo
 * do webview falha por CORS.
 */

const BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const KEY_TOKEN = "notion_token";
const KEY_PARENT = "notion_parent_page_id";
const KEY_DB = "notion_database_id";
const KEY_LAST_SYNC = "notion_last_sync";
// Notas: database PRÓPRIA (separada das ideias), mesmo token/página-pai.
const KEY_NOTES_DB = "notion_notes_database_id";
const KEY_NOTES_LAST_SYNC = "notion_notes_last_sync";

const HEAT_LABEL: Record<number, string> = { 1: "Fria", 2: "Morna", 3: "Quente" };

async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value]
  );
}

async function delSetting(key: string): Promise<void> {
  await getDb().execute("DELETE FROM app_settings WHERE key = $1", [key]);
}

export async function getNotionConfig(): Promise<{
  token: string | null;
  parentPageId: string | null;
  databaseId: string | null;
  lastSync: string | null;
}> {
  const [token, parentPageId, databaseId, lastSync] = await Promise.all([
    getSetting(KEY_TOKEN),
    getSetting(KEY_PARENT),
    getSetting(KEY_DB),
    getSetting(KEY_LAST_SYNC),
  ]);
  return { token, parentPageId, databaseId, lastSync };
}

export async function saveNotionToken(token: string): Promise<void> {
  await setSetting(KEY_TOKEN, token);
}

export async function clearNotionConfig(): Promise<void> {
  await Promise.all([
    delSetting(KEY_TOKEN),
    delSetting(KEY_PARENT),
    delSetting(KEY_DB),
    delSetting(KEY_LAST_SYNC),
    delSetting(KEY_NOTES_DB),
    delSetting(KEY_NOTES_LAST_SYNC),
  ]);
}

export async function getNotesNotionConfig(): Promise<{
  databaseId: string | null;
  lastSync: string | null;
}> {
  const [databaseId, lastSync] = await Promise.all([
    getSetting(KEY_NOTES_DB),
    getSetting(KEY_NOTES_LAST_SYNC),
  ]);
  return { databaseId, lastSync };
}

async function notionApi<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Valida o token chamando /users/me. Lança se inválido. */
export async function validateNotionToken(token: string): Promise<void> {
  await notionApi(token, "GET", "/users/me");
}

type NotionTitleProp = { type: string; title?: { plain_text: string }[] };
type NotionPage = { id: string; properties?: Record<string, NotionTitleProp> };

function pageTitle(page: NotionPage): string {
  const props = page.properties ?? {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === "title" && Array.isArray(p.title)) {
      const t = p.title.map((x) => x.plain_text).join("");
      if (t.trim()) return t;
    }
  }
  return "(página sem título)";
}

/** Páginas que a integração consegue ver — candidatas a "pasta" do database. */
export async function listNotionPages(
  token: string
): Promise<{ id: string; title: string }[]> {
  const res = await notionApi<{ results: NotionPage[] }>(token, "POST", "/search", {
    filter: { value: "page", property: "object" },
    page_size: 50,
  });
  return (res.results ?? []).map((p) => ({ id: p.id, title: pageTitle(p) }));
}

/**
 * Único caso que exige ação do usuário: a integração não está compartilhada com
 * NENHUMA página (Connections). A mensagem aponta pro passo certo — nunca pra
 * "escolher um projeto/página", porque o Vistage cria a estrutura sozinho.
 */
export class NotionNeedsConnectionsError extends Error {
  constructor() {
    super(
      "A integração do Vistage não está conectada a nenhuma página no Notion. " +
        "No Notion, abra uma página → ••• → Connections → adicione a integração do Vistage e tente de novo."
    );
    this.name = "NotionNeedsConnectionsError";
  }
}

/** Mensagem amigável de um erro do Notion (sem o ruído "Notion API 400: {json}"). */
export function notionErrorMessage(e: unknown): string {
  if (e instanceof NotionNeedsConnectionsError) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  const m = /Notion API \d+:\s*(\{[\s\S]*\})/.exec(raw);
  if (m) {
    try {
      const body = JSON.parse(m[1]) as { message?: string };
      if (body.message) return body.message;
    } catch {
      /* corpo não-JSON — usa o texto cru */
    }
  }
  return raw;
}

/** Estado da página-pai: utilizável, arquivada (na lixeira) ou sumida/sem acesso. */
async function pageState(token: string, pageId: string): Promise<"ok" | "archived" | "gone"> {
  try {
    const page = await notionApi<{ archived?: boolean; in_trash?: boolean }>(
      token,
      "GET",
      `/pages/${pageId}`
    );
    return page.archived || page.in_trash ? "archived" : "ok";
  } catch {
    return "gone";
  }
}

/**
 * Resolve uma página-pai utilizável pros databases do Vistage SEM pedir nada ao
 * usuário (auto-recuperação, idempotente):
 *  1. Tenta o id guardado — se existe e está OK, usa.
 *  2. Se está arquivado/na lixeira (e a integração pode editá-lo), DESARQUIVA e usa.
 *  3. Se está obsoleto/sumido, DESCARTA o id e cria uma página "Vistage" nova sob a
 *     primeira página acessível (via /search), guardando o novo id. Sem loop no velho.
 *  4. Se /search não acha NADA → NotionNeedsConnectionsError (único caso de usuário).
 */
async function resolveVistageParent(token: string, storedParentId: string | null): Promise<string> {
  if (storedParentId) {
    const st = await pageState(token, storedParentId);
    if (st === "ok") return storedParentId;
    if (st === "archived") {
      // Tenta tirar da lixeira. PORÉM: a API do Notion NÃO desarquiva páginas de
      // nível RAIZ/workspace ("Unarchiving workspace level pages not supported by
      // the API"). Se falhar (por isso ou qualquer outro motivo), não trava: cai
      // pro caminho de reaproveitar/recriar uma página acessível, logo abaixo.
      try {
        await notionApi(token, "PATCH", `/pages/${storedParentId}`, {
          archived: false,
          in_trash: false,
        });
        return storedParentId;
      } catch {
        /* não dá pra reviver (ex.: página de nível raiz na lixeira) — recria abaixo */
      }
    }
    // "gone" ou desarquivar falhou: descarta o id velho e parte pra busca (sem loop).
  }
  const pages = await listNotionPages(token);
  if (pages.length === 0) throw new NotionNeedsConnectionsError();
  // Reaproveita uma página "Vistage" acessível que já exista (de uma tentativa
  // anterior, ou a própria página compartilhada pelo usuário) em vez de duplicar.
  // O /search normalmente já exclui páginas na lixeira, mas o índice é eventualmente
  // consistente — então confirmamos o ESTADO da candidata antes de reaproveitar; se
  // não estiver utilizável (ex.: reapareceu arquivada na janela de propagação),
  // ignoramos e criamos uma nova.
  const candidate = pages.find((p) => p.title.trim().toLowerCase() === "vistage");
  if (candidate && (await pageState(token, candidate.id)) === "ok") {
    await setSetting(KEY_PARENT, candidate.id);
    return candidate.id;
  }
  // Cria uma página-pai "Vistage" sob a primeira página acessível e guarda o id.
  // Evita usar a candidata recusada como host, caso ela tenha reaparecido arquivada.
  const host = (pages.find((p) => p.id !== candidate?.id) ?? pages[0]).id;
  const created = await notionApi<{ id: string }>(token, "POST", "/pages", {
    parent: { type: "page_id", page_id: host },
    properties: { title: { title: [{ type: "text", text: { content: "Vistage" } }] } },
  });
  await setSetting(KEY_PARENT, created.id);
  return created.id;
}

/**
 * Cria o database "Ideias". A página-pai é resolvida automaticamente
 * (desarquiva/recria sozinho — ver resolveVistageParent); `preferredParentId` é
 * só uma dica (ex.: a página que o usuário já tinha) — se obsoleta, é descartada.
 */
export async function createIdeasDatabase(
  token: string,
  preferredParentId?: string
): Promise<string> {
  const parent = await resolveVistageParent(token, preferredParentId || (await getSetting(KEY_PARENT)));
  const res = await notionApi<{ id: string }>(token, "POST", "/databases", {
    parent: { type: "page_id", page_id: parent },
    title: [{ type: "text", text: { content: "💡 Ideias — Vistage" } }],
    properties: {
      Name: { title: {} },
      Resumo: { rich_text: {} },
      Categoria: { select: {} },
      Calor: { select: {} },
      Maturação: { select: {} },
      Tags: { multi_select: {} },
    },
  });
  await Promise.all([setSetting(KEY_PARENT, parent), setSetting(KEY_DB, res.id)]);
  return res.id;
}

type IdeaRow = {
  id: number;
  title: string;
  body: string | null;
  category: string | null;
  tags: string | null;
  heat: number;
  maturation: string;
  notion_page_id: string | null;
};

/** Nome de opção de select/multi-select seguro (sem vírgula, não vazio). */
function optName(s: string): string {
  return s.replace(/,/g, " ").trim().slice(0, 90) || "—";
}

function buildProps(idea: IdeaRow): Record<string, unknown> {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(idea.tags ?? "[]");
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    /* tags inválidas — ignora */
  }
  return {
    Name: { title: [{ text: { content: idea.title.slice(0, 1900) || "(sem título)" } }] },
    Resumo: {
      rich_text: idea.body ? [{ text: { content: idea.body.slice(0, 1900) } }] : [],
    },
    Categoria: idea.category ? { select: { name: optName(idea.category) } } : { select: null },
    Calor: { select: { name: HEAT_LABEL[idea.heat] ?? "Fria" } },
    Maturação: { select: { name: optName(idea.maturation) } },
    Tags: { multi_select: tags.map((t) => ({ name: optName(t) })) },
  };
}

export type NotionSyncResult = { created: number; updated: number; failed: number };

/**
 * Empurra todas as ideias pro database do Notion. Cada ideia vira/atualiza uma
 * página (guardamos o notion_page_id pra não duplicar). Best-effort por ideia:
 * uma falha não derruba o resto. Se a página sumiu lá (404), recria.
 */
export async function syncNotion(): Promise<NotionSyncResult> {
  const { token, databaseId } = await getNotionConfig();
  if (!token || !databaseId) throw new Error("Notion não configurado");
  const db = getDb();
  const ideas = await db.select<IdeaRow[]>(
    "SELECT id, title, body, category, tags, heat, maturation, notion_page_id FROM ideas"
  );

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const idea of ideas) {
    const properties = buildProps(idea);
    try {
      if (idea.notion_page_id) {
        try {
          await notionApi(token, "PATCH", `/pages/${idea.notion_page_id}`, { properties });
          updated++;
        } catch {
          // página sumiu/arquivada lá → recria e regrava o id
          const page = await notionApi<{ id: string }>(token, "POST", "/pages", {
            parent: { database_id: databaseId },
            properties,
          });
          await db.execute("UPDATE ideas SET notion_page_id = $1 WHERE id = $2", [page.id, idea.id]);
          created++;
        }
      } else {
        const page = await notionApi<{ id: string }>(token, "POST", "/pages", {
          parent: { database_id: databaseId },
          properties,
        });
        await db.execute("UPDATE ideas SET notion_page_id = $1 WHERE id = $2", [page.id, idea.id]);
        created++;
      }
    } catch {
      failed++;
    }
  }

  await setSetting(KEY_LAST_SYNC, new Date().toISOString());
  // Gravou notion_page_id em ideias novas → mudou o documento (marca não salvo).
  if (created > 0) emitDataChanged();
  return { created, updated, failed };
}

// ── Notas → database própria (separada das ideias) ────────────────────────────

/**
 * Cria o database "Notas". O usuário NÃO escolhe a página: a página-pai é
 * resolvida e consertada sozinha (desarquiva o id guardado, ou descarta o
 * obsoleto e cria uma "Vistage" nova sob a primeira página acessível). Idempotente.
 */
export async function createNotesDatabase(token: string): Promise<string> {
  const parent = await resolveVistageParent(token, await getSetting(KEY_PARENT));
  const res = await notionApi<{ id: string }>(token, "POST", "/databases", {
    parent: { type: "page_id", page_id: parent },
    title: [{ type: "text", text: { content: "📝 Notas — Vistage" } }],
    properties: {
      Name: { title: {} },
      Conteúdo: { rich_text: {} },
      Pasta: { select: {} },
      Tags: { multi_select: {} },
    },
  });
  await Promise.all([setSetting(KEY_PARENT, parent), setSetting(KEY_NOTES_DB, res.id)]);
  return res.id;
}

/** Título da página-pai atual (pra mostrar "indo para qual página"). */
export async function getNotionPageTitle(token: string, pageId: string): Promise<string | null> {
  try {
    const page = await notionApi<NotionPage>(token, "GET", `/pages/${pageId}`);
    return pageTitle(page);
  } catch {
    return null;
  }
}

/**
 * Troca a página-pai do Notion: recria os databases (Ideias e Notas) sob a
 * página escolhida e zera os vínculos (notion_page_id) pra que a próxima
 * sincronização recrie tudo lá. As páginas antigas ficam onde estavam.
 */
export async function repointNotionParent(token: string, parentPageId: string): Promise<void> {
  await createIdeasDatabase(token, parentPageId);
  try {
    await createNotesDatabase(token);
  } catch {
    /* database de Notas é opcional */
  }
  const db = getDb();
  await db.execute("UPDATE ideas SET notion_page_id = NULL").catch(() => {});
  await db.execute("UPDATE notes SET notion_page_id = NULL").catch(() => {});
}

/** HTML do corpo da nota → texto puro (o Notion recebe rich_text simples). */
function htmlToPlain(html: string): string {
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const withBreaks = html
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  if (typeof DOMParser === "undefined") return withBreaks.replace(/<[^>]+>/g, "");
  return new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ?? "";
}

type NoteRow = {
  id: number;
  title: string;
  body: string | null;
  folder: string | null;
  tags: string | null;
};

/** Empurra todas as notas pro database de Notas no Notion (1 via, best-effort). */
export async function syncNotesNotion(): Promise<NotionSyncResult> {
  const { token } = await getNotionConfig();
  const { databaseId } = await getNotesNotionConfig();
  if (!token || !databaseId) throw new Error("Database de Notas do Notion não configurado");
  const db = getDb();
  const notes = await db.select<NoteRow[]>(
    `SELECT n.id, n.title, n.body, f.name AS folder,
            (SELECT group_concat(t.name, ',') FROM note_note_tags nt
               JOIN note_tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id) AS tags
       FROM notes n LEFT JOIN note_folders f ON f.id = n.folder_id`
  );

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const n of notes) {
    const tags = (n.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: (n.title || "(sem título)").slice(0, 1900) } }] },
      Conteúdo: {
        rich_text: n.body ? [{ text: { content: htmlToPlain(n.body).slice(0, 1900) } }] : [],
      },
      Pasta: n.folder ? { select: { name: optName(n.folder) } } : { select: null },
      Tags: { multi_select: tags.map((t) => ({ name: optName(t) })) },
    };
    const pageRow = await db.select<{ notion_page_id: string | null }[]>(
      "SELECT notion_page_id FROM notes WHERE id = $1",
      [n.id]
    );
    const pageId = pageRow[0]?.notion_page_id ?? null;
    try {
      if (pageId) {
        try {
          await notionApi(token, "PATCH", `/pages/${pageId}`, { properties });
          updated++;
        } catch {
          const page = await notionApi<{ id: string }>(token, "POST", "/pages", {
            parent: { database_id: databaseId },
            properties,
          });
          await db.execute("UPDATE notes SET notion_page_id = $1 WHERE id = $2", [page.id, n.id]);
          created++;
        }
      } else {
        const page = await notionApi<{ id: string }>(token, "POST", "/pages", {
          parent: { database_id: databaseId },
          properties,
        });
        await db.execute("UPDATE notes SET notion_page_id = $1 WHERE id = $2", [page.id, n.id]);
        created++;
      }
    } catch {
      failed++;
    }
  }

  await setSetting(KEY_NOTES_LAST_SYNC, new Date().toISOString());
  return { created, updated, failed };
}
