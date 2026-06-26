import { getDb, type BatchStatement } from "./db";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { useConfigStore } from "./config";
import { getPortableSession, restorePortableSession, type PortableSession } from "./supabase";
import { persistAppearanceToDocument } from "./theme";
import { persistViewPrefsToDocument } from "./docSettings";
import {
  decryptString,
  isEncryptedRaw,
  isEncryptedContainer,
  encryptBytes,
  decryptBytes,
  readEncryptedHint,
} from "./crypto";
import { getDocPassword, getDocPasswordHint, setDocPassword } from "./docPassword";
import { promptPassword } from "./passwordPrompt";
import { toast } from "@/components/ui/toaster";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

/** Versão do formato de backup. Bump se mudar o schema de exportação. */
const BACKUP_VERSION = 2;

const TABLES = [
  // ── sem dependências ──────────────────────────────────────────────────────
  "app_settings",
  "gcal_auth",
  "document_settings", // tema/acento — viaja com o .vistage (NÃO é máquina)
  "venues",          // contacts.venue_id → venues  (deve vir antes de contacts)
  "fans",
  "fan_groups",
  "students",
  "class_packages",
  "artist_identity",
  "artist_templates",
  "party_series",            // marca durável; parties.series_id → party_series
  "parties",
  "music_projects",
  "finance_categories",
  "equipment",
  "work_sessions",
  "highlights",
  "okrs",
  "ideas",
  "content",
  "suppliers",
  "custom_rules",       // regras de alerta/insight do usuário — viajam no .vistage
  "manual_insights",    // provocações criadas pelo usuário
  "dismissed_insights", // insights dispensados (não reaparecem)
  // ── dependem do nível anterior ────────────────────────────────────────────
  "contacts",        // venue_id → venues
  "fan_interactions",        // fan_id → fans
  "fan_group_members",       // fan_id → fans, group_id → fan_groups
  "student_packages",        // student_id → students, package_id → class_packages
  "party_costs",             // party_id → parties
  "party_stages",            // party_id → parties
  "party_budget_items",      // party_id → parties
  "party_tickets",           // party_id → parties
  "party_venue_candidates",  // party_id → parties, venue_id → venues
  "party_runsheet",          // party_id → parties, performer_contact_id → contacts
  "party_guests",            // party_id → parties
  "supplier_services",       // supplier_id → suppliers
  "content_scenes",          // content_id → content
  "tracks",                  // project_id → music_projects
  "music_project_costs",     // project_id → music_projects
  "finance_transactions",    // category_id → finance_categories
  "finance_recurring",       // category_id → finance_categories
  "content_snapshots",       // content_id → content
  // ── dependem do nível anterior ────────────────────────────────────────────
  "contact_interactions",    // contact_id → contacts
  "gigs",                    // venue_id → venues, promoter_contact_id → contacts
  "classes",                 // student_id → students
  "party_tasks",             // party_id → parties, stage_id → party_stages
  "track_collaborators",     // track_id → tracks
  "track_flow_sessions",     // track_id → tracks
  "track_media_targets",     // track_id → tracks
  "track_performance_snapshots", // track_id → tracks
  // ── dependem do nível anterior ────────────────────────────────────────────
  "gig_debrief_drafts",      // gig_id → gigs
  "gig_setlists",            // gig_id → gigs
  "gig_tracks",              // gig_id → gigs, track_id → tracks
  "gig_fans",                // gig_id → gigs, fan_id → fans
  "tasks",                   // gig_id → gigs, contact_id → contacts
  "meetings",                // task_id → tasks
  // ── dependem do nível anterior ────────────────────────────────────────────
  "subtasks",                // task_id → tasks
  "okr_kr_tasks",            // okr_id → okrs, task_id → tasks
  // ── Biblioteca (sem deps externas; ordem interna pais→filhos) ──────────────
  "library_tracks",          // Músicas — só caminho+metadados (áudio NUNCA embutido)
  "gig_library_tracks",      // setlist: gig_id → gigs, library_track_id → library_tracks
  "drive_documents",         // Documentos — cache da pasta do Drive
  "note_folders",            // Conhecimento — parent_id self-ref (DEFERRED_FK)
  "note_tags",
  "notes",                   // folder_id → note_folders
  "note_note_tags",          // note_id → notes, tag_id → note_tags
  "note_links",              // source/target → notes
  "document_links",          // drive_document_id → drive_documents
] as const;

type TableName = (typeof TABLES)[number];

export type Backup = {
  version: number;
  exportedAt: string;
  app: "vistage" | "musicgest"; // aceita backups antigos do MusicGest
  tables: Record<TableName, Record<string, unknown>[]>;
  /**
   * Arquivos de anexo incluídos no backup (v2+).
   * Chave: caminho RELATIVO ao uploadsDir (ex: "fans/abc123.jpg").
   * Valor: data URL base64 ("data:image/jpeg;base64,...").
   */
  files?: Record<string, string>;
  /** uploadsDir do sistema de origem — usado para relativizar e restaurar caminhos. */
  uploadsDir?: string;
  /**
   * Sessão de sincronização (Supabase) embutida pra reconectar o mesmo usuário
   * numa máquina nova sem redigitar a senha. É uma credencial — por isso o
   * .vistage carrega o aviso "não compartilhe". Ausente se não houver login.
   */
  session?: PortableSession;
};

// Colunas que armazenam caminhos de arquivos (caminho absoluto ou relativo).
// extra_flyer_paths é JSON array de caminhos.
const FILE_PATH_COLS: Partial<Record<TableName, string[]>> = {
  gigs:                 ["script_file_path", "banner_file_path", "invoice_file_path", "briefing_file_path"],
  contacts:             ["photo_path"],
  fans:                 ["photo_path"],
  venues:               ["photo_path"],
  equipment:            ["photo_path"],
  finance_transactions: ["receipt_file_path"],
  // (finance_recurring NÃO tem receipt_file_path; artist_identity NÃO tem
  //  thumbnail_path/file_path — eram colunas fantasma que quebravam o rewrite
  //  de caminhos no restore entre máquinas.)
  tracks:               ["daw_project_path", "stems_path", "final_files_path"],
  artist_identity:      ["logo_path", "isotype_path", "presskit_path", "brand_manual_path"],
  artist_templates:     ["file_path", "thumbnail_path"],
};

/** Colunas cujo valor é um JSON array de caminhos. */
const FILE_PATH_JSON_COLS: Partial<Record<TableName, string[]>> = {
  gigs: ["extra_flyer_paths"],
  tracks: ["reference_files"],
};

/**
 * Colunas cujo valor é um JSON array de OBJETOS, cada um com um campo de caminho.
 * Ex.: a galeria da Identidade (`artist_identity.photos` = [{ path, type, … }])
 * e as fontes da marca (`artist_identity.fonts` = [{ name, file_path, … }]).
 * Sem isso, os bytes da galeria/fontes não entravam no .vistage e sumiam ao
 * abrir o arquivo em outra máquina.
 */
const FILE_PATH_JSON_OBJECT_COLS: Partial<
  Record<TableName, { col: string; pathKey: string }[]>
> = {
  artist_identity: [
    { col: "photos", pathKey: "path" },
    { col: "fonts", pathKey: "file_path" },
  ],
};

function joinPath(...parts: string[]): string {
  const sep = parts[0]?.includes("\\") && !parts[0].includes("/") ? "\\" : "/";
  return parts
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .filter(Boolean)
    .join(sep);
}

function relativize(absPath: string, uploadsDir: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/");
  const rel = norm(absPath).replace(norm(uploadsDir).replace(/\/$/, "") + "/", "");
  return rel;
}

/**
 * Parte RELATIVA de um caminho de anexo, robusta entre máquinas: tudo após o
 * último "/uploads/". O `relativize` simples só funciona quando o caminho começa
 * exatamente com o uploadsDir atual — o que NÃO acontece ao abrir um .vistage
 * cujos caminhos absolutos vieram de outro computador (ex.: Mac → Windows). Sem
 * isso, a chave do arquivo virava o caminho absoluto inteiro e o anexo não era
 * embutido nem restaurado. Mesma lógica do `resolveUnderCurrentUploads` (uploads.ts).
 */
function relUnderUploads(absPath: string, uploadsDir: string): string {
  const norm = absPath.replace(/\\/g, "/");
  const idx = norm.toLowerCase().lastIndexOf("/uploads/");
  if (idx !== -1) {
    return norm
      .slice(idx + "/uploads/".length)
      .split("/")
      .filter(Boolean)
      .join("/");
  }
  return relativize(absPath, uploadsDir);
}

function mimeForExt(name: string): string {
  const ext = (name.match(/\.([a-zA-Z0-9]+)$/) ?? [])[1]?.toLowerCase() ?? "bin";
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
    : ext === "webp" ? "image/webp"
    : ext === "pdf" ? "application/pdf"
    : ext === "mp4" || ext === "m4v" ? "video/mp4"
    : ext === "mov" ? "video/quicktime"
    : ext === "webm" ? "video/webm"
    : ext === "avi" ? "video/x-msvideo"
    : ext === "mkv" ? "video/x-matroska"
    : "application/octet-stream";
}

/** Bytes → data URL base64 (em blocos: vídeos grandes travavam o concat). */
function bytesToDataUrl(bytes: Uint8Array, name: string): string {
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeForExt(name)};base64,${btoa(bin)}`;
}

// ── Leitura RESILIENTE de anexos ─────────────────────────────────────────────
// Um único anexo inacessível (caminho de outra máquina, placeholder de nuvem do
// Google Drive/OneDrive, arquivo bloqueado ou numa unidade removida) NÃO pode
// travar o salvar para sempre — era a causa do "salvamento eterno". Cada leitura
// tem TIMEOUT; e um caminho salvo que não resolve é re-tentado sob o uploadsDir
// ATUAL (igual ao useImageUrl), para que tudo que o app exibe também seja salvo.
const READ_TIMEOUT_MS = 12_000;
const READ_CONCURRENCY = 6;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** map com concorrência limitada — evita 1 leitura travada bloquear todas em série. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

/** Lê um arquivo com timeout; nunca rejeita nem trava (retorna null no limite). */
function readFileTimed(path: string): Promise<Uint8Array | null> {
  return withTimeout(
    readFile(path)
      .then((b) => b as Uint8Array)
      .catch(() => null),
    READ_TIMEOUT_MS,
    null
  );
}

/**
 * Bytes de um anexo: tenta o caminho salvo; se falhar/expirar, tenta sob o
 * uploadsDir ATUAL (a parte após "/uploads/"). Retorna null se nenhum resolver.
 */
async function readAttachmentBytes(
  abs: string,
  rel: string,
  uploadsDir: string
): Promise<Uint8Array | null> {
  const first = await readFileTimed(abs);
  if (first) return first;
  if (uploadsDir && rel) {
    const alt = joinPath(uploadsDir, ...rel.split("/").filter(Boolean));
    if (alt !== abs) {
      const second = await readFileTimed(alt);
      if (second) return second;
    }
  }
  return null;
}

/**
 * Mapeia caminho-relativo → caminho-absoluto de TODOS os arquivos referenciados
 * pelas colunas do catálogo (allowlists). É a fonte única usada tanto pelo
 * formato JSON (base64) quanto pelo contêiner (bytes crus).
 */
function collectFilePaths(
  tables: Backup["tables"],
  uploadsDir: string
): Record<string, string> {
  const paths: Record<string, string> = {};
  const add = (val: unknown) => {
    if (typeof val !== "string" || !val) return;
    const rel = relUnderUploads(val, uploadsDir);
    if (rel && paths[rel] === undefined) paths[rel] = val;
  };
  for (const [table, cols] of Object.entries(FILE_PATH_COLS) as [TableName, string[]][]) {
    for (const row of tables[table] ?? []) for (const col of cols) add(row[col]);
  }
  for (const [table, cols] of Object.entries(FILE_PATH_JSON_COLS) as [TableName, string[]][]) {
    for (const row of tables[table] ?? []) {
      for (const col of cols) {
        const raw = row[col];
        if (typeof raw !== "string" || !raw) continue;
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) for (const p of arr) add(p);
        } catch { /* ignora */ }
      }
    }
  }
  for (const [table, specs] of Object.entries(FILE_PATH_JSON_OBJECT_COLS) as [
    TableName,
    { col: string; pathKey: string }[]
  ][]) {
    for (const row of tables[table] ?? []) {
      for (const { col, pathKey } of specs) {
        const raw = row[col];
        if (typeof raw !== "string" || !raw) continue;
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr))
            for (const item of arr) {
              if (item && typeof item === "object") add((item as Record<string, unknown>)[pathKey]);
            }
        } catch { /* ignora */ }
      }
    }
  }
  return paths;
}

/** Reúne os arquivos referenciados como base64 (formato JSON legado). */
async function collectFiles(
  tables: Backup["tables"],
  uploadsDir: string
): Promise<Record<string, string>> {
  const entries = Object.entries(collectFilePaths(tables, uploadsDir));
  const read = await mapLimit(entries, READ_CONCURRENCY, async ([rel, abs]) => ({
    rel,
    bytes: await readAttachmentBytes(abs, rel, uploadsDir),
  }));
  const files: Record<string, string> = {};
  for (const { rel, bytes } of read) if (bytes) files[rel] = bytesToDataUrl(bytes, rel);
  return files;
}

/**
 * Reúne os arquivos referenciados como BYTES crus (pro contêiner zip), com
 * leitura resiliente (timeout + fallback no uploadsDir atual + concorrência).
 * Devolve também a lista de anexos que NÃO puderam ser lidos, para o salvar
 * avisar o usuário em vez de sumir com eles em silêncio.
 */
async function collectRawFiles(
  tables: Backup["tables"],
  uploadsDir: string,
  skipRels: Set<string> = new Set()
): Promise<{ files: Record<string, Uint8Array>; skipped: string[] }> {
  // Pula o que já vive no Google Drive (mapeado em drive_media) — não embute,
  // mas também não conta como "perdido": é intencional, mantém o .vistage leve.
  const entries = Object.entries(collectFilePaths(tables, uploadsDir)).filter(
    ([rel]) => !skipRels.has(rel)
  );
  const read = await mapLimit(entries, READ_CONCURRENCY, async ([rel, abs]) => ({
    rel,
    bytes: await readAttachmentBytes(abs, rel, uploadsDir),
  }));
  const files: Record<string, Uint8Array> = {};
  const skipped: string[] = [];
  for (const { rel, bytes } of read) {
    if (bytes) files[rel] = bytes;
    else skipped.push(rel);
  }
  return { files, skipped };
}

/** Restaura arquivos do backup para o uploadsDir atual. */
async function restoreFiles(
  files: Record<string, string>,
  uploadsDir: string
): Promise<void> {
  for (const [rel, dataUrl] of Object.entries(files)) {
    try {
      const absPath = joinPath(uploadsDir, rel);
      const dir = absPath.substring(0, Math.max(absPath.lastIndexOf("/"), absPath.lastIndexOf("\\")));
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });
      // base64 → Uint8Array
      const b64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await writeFile(absPath, bytes);
    } catch {
      // arquivo não-crítico — falha silenciosa
    }
  }
}

/**
 * Lê todas as tabelas do banco e gera um objeto Backup completo.
 * Inclui os arquivos de anexo como base64 (v2+) — fotos, flyers, etc.
 *
 * PORTABILIDADE TOTAL: por opção do usuário, o .vistage carrega TUDO — inclusive
 * segredos das integrações (client_secret e tokens OAuth do Google, token do
 * Todoist em app_settings; tokens do Calendar em gcal_auth) e a sessão de
 * sincronização do Supabase. Assim, abrir o arquivo numa máquina nova já
 * reconecta as integrações e o usuário de sync. O preço é que o arquivo passa a
 * conter credenciais em texto puro — a UI exibe um aviso de "não compartilhe".
 */
/**
 * Monta o Backup SEM os arquivos (só dados/metadados/sessão). É a base do
 * formato CONTÊINER (os arquivos entram como entradas cruas no zip, não em
 * base64 num JSON gigante na memória — o que estourava no Windows).
 */
export async function buildBackupData(): Promise<Backup> {
  const db = getDb();
  // Garante que a aparência (tema/cor) e as preferências de view estejam
  // gravadas no documento antes de lê-lo (mesmo após um boot em branco).
  // Com timeout: uma escrita travada não pode prender o salvar para sempre.
  await withTimeout(persistAppearanceToDocument().catch(() => {}), 5000, undefined);
  await withTimeout(persistViewPrefsToDocument().catch(() => {}), 5000, undefined);
  const tables = {} as Backup["tables"];
  for (const t of TABLES) {
    tables[t] = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t}`);
  }
  const uploadsDir = useConfigStore.getState().config?.uploadsDir ?? "";
  // getPortableSession faz getSession() do Supabase, que pode disparar um refresh
  // de token pela REDE (sem timeout próprio). Limita aqui: sem rede, o salvar não
  // pode ficar eterno só por causa da sessão de sync — segue sem ela.
  const session = (await withTimeout(getPortableSession(), 5000, null)) ?? undefined;
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "vistage",
    tables,
    files: {},
    uploadsDir,
    ...(session ? { session } : {}),
  };
}

/**
 * Backup completo no formato JSON LEGADO (arquivos embutidos como base64). Usado
 * pelo backup de transição e pelo "Salvar" quando há senha de documento. Embute
 * só os arquivos referenciados pelas colunas do catálogo (allowlists) — nunca
 * varre o uploadsDir inteiro (órfãos estouravam a memória).
 */
export async function buildBackup(): Promise<Backup> {
  const data = await buildBackupData();
  const uploadsDir = data.uploadsDir ?? "";
  if (uploadsDir) {
    try {
      data.files = await collectFiles(data.tables, uploadsDir);
    } catch {
      // não bloqueia o backup se a leitura de arquivos falhar
    }
  }
  return data;
}

/**
 * Reconecta a sessão de sincronização (Supabase) que veio embutida no .vistage.
 * Chamado depois de abrir/mesclar um documento. No-op se o arquivo não tiver
 * sessão ou se já houver login ativo nesta máquina. Não bloqueia o fluxo.
 */
export async function restoreBackupSession(backup: Backup): Promise<void> {
  try {
    await restorePortableSession(backup.session);
  } catch {
    // reconexão é best-effort — o usuário sempre pode logar manualmente
  }
}

// Tabelas que SOBREVIVEM ao "abre em branco": integrações e preferências da
// máquina (tokens do Google/Todoist em app_settings, tokens do Calendar em
// gcal_auth, atalhos, intenção de notificação). NÃO são zeradas a cada boot —
// senão o app desconectaria as integrações toda vez que iniciasse em branco.
//
// Atenção: "sobrevive ao boot" ≠ "fica fora do documento". O conteúdo destas
// tabelas TAMBÉM viaja dentro do .vistage (ver buildBackup) pra reconectar as
// integrações numa máquina nova. Aqui elas só são poupadas do wipe de boot e
// não contam como "dados de documento" em hasAnyDocumentData.
const MACHINE_TABLES: TableName[] = ["app_settings", "gcal_auth"];

/**
 * Zera os dados de DOCUMENTO (gigs, aulas, contatos, finanças…), preservando
 * as configurações da máquina (app_settings, gcal_auth). É o núcleo do modelo
 * "abre em branco": a cada boot o app começa vazio e o usuário abre um
 * `.vistage`. Apaga em ordem inversa de TABLES (filhos antes de pais), num
 * único lote atômico — ou limpa tudo, ou nada (ROLLBACK).
 */
export async function clearDocumentData(): Promise<void> {
  const db = getDb();
  const stmts: BatchStatement[] = [];
  for (const t of [...TABLES].reverse()) {
    if (MACHINE_TABLES.includes(t)) continue;
    stmts.push({ sql: `DELETE FROM ${t}` });
  }
  await db.executeBatch(stmts);
}

/**
 * true se houver QUALQUER dado de documento (em qualquer tabela não-máquina).
 * Mais abrangente que isDatabaseEmpty (que só olha gigs/contatos/tarefas/finanças)
 * — usado antes de zerar pela primeira vez para NUNCA descartar dados sem antes
 * exportar um backup.
 */
export async function hasAnyDocumentData(): Promise<boolean> {
  const db = getDb();
  for (const t of TABLES) {
    if (MACHINE_TABLES.includes(t)) continue;
    try {
      const r = await db.select<{ n: number }[]>(`SELECT EXISTS(SELECT 1 FROM ${t}) as n`);
      if ((r[0]?.n ?? 0) > 0) return true;
    } catch {
      // tabela pode não existir em bancos de versões diferentes — ignora
    }
  }
  return false;
}

/**
 * Escreve os anexos embutidos (base64) de um backup no uploadsDir atual.
 * Usado pela mesclagem de documento (o restore completo já faz isso por dentro).
 */
export async function restoreBackupFiles(backup: Backup): Promise<void> {
  const uploadsDir = useConfigStore.getState().config?.uploadsDir ?? "";
  if (!uploadsDir || !backup.files || Object.keys(backup.files).length === 0) return;
  await restoreFiles(backup.files, uploadsDir).catch(() => {});
}

/** Valida e converte o texto bruto de um arquivo .vistage/backup em Backup. */
export function parseBackupRaw(raw: string): Backup {
  const parsed = JSON.parse(raw) as Partial<Backup>;
  if (parsed.app !== "vistage" && parsed.app !== "musicgest") {
    throw new Error("Arquivo não é um documento do Vistage.");
  }
  if (typeof parsed.version !== "number" || parsed.version > BACKUP_VERSION) {
    throw new Error(
      `Versão do arquivo (${parsed.version}) é mais nova que a suportada por este app.`
    );
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error("Arquivo sem dados.");
  }
  return parsed as Backup;
}

// ── Contêiner .vistage (zip) ─────────────────────────────────────────────────
// Formato novo: UM arquivo zip com `vistage.json` (dados, SEM base64) +
// `files/<rel>` (bytes crus). Evita inflar tudo em base64 num JSON gigante na
// memória ao salvar — a causa do "Out of memory" no Windows. Continua sendo um
// arquivo só (.vistage). Detectado na leitura pela assinatura "PK".
function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Monta os BYTES do contêiner zip (vistage.json + files/<rel> crus). Devolve
 * também os anexos que não puderam ser lidos (para o salvar avisar).
 */
async function buildContainerBytes(
  data: Backup
): Promise<{ bytes: Uint8Array; skipped: string[] }> {
  const uploadsDir = data.uploadsDir ?? useConfigStore.getState().config?.uploadsDir ?? "";
  const entries: Record<string, Uint8Array> = {
    "vistage.json": strToU8(JSON.stringify({ ...data, files: {} })),
  };
  let skipped: string[] = [];
  if (uploadsDir) {
    // Mídia já enviada ao Google Drive (mapeada em app_settings drive_media:<rel>)
    // NÃO é embutida — fica só no Drive, deixando o .vistage leve.
    const driveRels = new Set(
      (data.tables.app_settings ?? [])
        .map((r) => String((r as Record<string, unknown>).key ?? ""))
        .filter((k) => k.startsWith("drive_media:"))
        .map((k) => k.slice("drive_media:".length))
    );
    const raw = await collectRawFiles(data.tables, uploadsDir, driveRels);
    for (const [rel, bytes] of Object.entries(raw.files)) entries[`files/${rel}`] = bytes;
    skipped = raw.skipped;
  }
  // level 0 = store (mídia já é comprimida; evita CPU à toa e mantém rápido).
  return { bytes: zipSync(entries, { level: 0 }), skipped };
}

/** Empacota o documento como contêiner zip (dados + arquivos crus, store). */
export async function writeContainer(path: string, data: Backup): Promise<string[]> {
  const { bytes, skipped } = await buildContainerBytes(data);
  await writeFile(path, bytes);
  return skipped;
}

/**
 * Contêiner CIFRADO: zipa os dados/arquivos (bytes crus) e cifra o zip inteiro
 * com a senha do documento (envelope binário "VENC"). Continua leve na memória —
 * NÃO há base64 nem JSON gigante. Resolve o "salvamento eterno"/Out of memory
 * que acontecia ao salvar documentos com senha + fotos/vídeos embutidos.
 */
export async function writeEncryptedContainer(
  path: string,
  data: Backup,
  password: string,
  hint?: string | null
): Promise<string[]> {
  const { bytes, skipped } = await buildContainerBytes(data);
  const sealed = await encryptBytes(bytes, password, hint);
  await writeFile(path, sealed);
  return skipped;
}

/** Lê um contêiner zip e reconstrói o Backup (arquivos viram base64 p/ o restore). */
export function readContainer(bytes: Uint8Array): Backup {
  const unzipped = unzipSync(bytes);
  const jsonEntry = unzipped["vistage.json"];
  if (!jsonEntry) throw new Error("Contêiner .vistage inválido (sem vistage.json).");
  const backup = parseBackupRaw(strFromU8(jsonEntry));
  const files: Record<string, string> = {};
  for (const [name, content] of Object.entries(unzipped)) {
    if (!name.startsWith("files/")) continue;
    const rel = name.slice("files/".length);
    if (rel) files[rel] = bytesToDataUrl(content, rel);
  }
  backup.files = files;
  return backup;
}

/**
 * Grava o documento no caminho — sempre como CONTÊINER (zip leve na memória).
 * SEM senha → contêiner puro. COM senha → contêiner CIFRADO (envelope "VENC").
 * Nenhum dos caminhos materializa base64/JSON gigante: acabou o "salvamento
 * eterno"/Out of memory ao salvar com fotos e vídeos embutidos. Em ambos os
 * casos é um único arquivo .vistage.
 */
export async function saveBackupToPath(path: string): Promise<{ skipped: string[] }> {
  const data = await buildBackupData();
  const pw = getDocPassword();
  const skipped = pw
    ? await writeEncryptedContainer(path, data, pw, getDocPasswordHint())
    : await writeContainer(path, data);
  return { skipped };
}

/** Lê e valida um arquivo de documento a partir do caminho (contêiner ou JSON). */
export async function readBackupFromPath(path: string): Promise<Backup> {
  const bytes = await readFile(path);
  if (isEncryptedContainer(bytes)) {
    throw new Error("Documento protegido por senha — abra pelo menu Abrir.");
  }
  if (isZip(bytes)) return readContainer(bytes);
  const raw = strFromU8(bytes);
  if (isEncryptedRaw(raw)) {
    throw new Error("Documento protegido por senha — abra pelo menu Abrir.");
  }
  return parseBackupRaw(raw);
}

/**
 * Lê um arquivo que pode ser CONTÊINER (zip), JSON puro ou JSON CIFRADO. Se for
 * cifrado, pede a senha e decifra (lembrando-a p/ os próximos "Salvar"); senão,
 * limpa a senha. Retorna o Backup, ou null se cancelar / senha errada.
 */
export async function readMaybeEncrypted(path: string): Promise<Backup | null> {
  const bytes = await readFile(path);

  // Contêiner CIFRADO (novo formato com senha): pede a senha, decifra os bytes
  // do zip e reconstrói o documento. Leve na memória (sem base64/JSON gigante).
  if (isEncryptedContainer(bytes)) {
    const savedHint = readEncryptedHint(bytes); // legível antes de decifrar (v2)
    const pw = await promptPassword({
      title: "Documento protegido",
      description: "Este arquivo .vistage está protegido por senha. Digite-a para abrir.",
      confirmLabel: "Abrir",
      hint: savedHint,
    });
    if (pw == null) return null; // cancelou
    let zipBytes: Uint8Array;
    try {
      zipBytes = await decryptBytes(bytes, pw);
    } catch (e) {
      toast.error((e as Error).message ?? "Não foi possível decifrar o arquivo.");
      return null;
    }
    setDocPassword(pw, savedHint); // lembra senha + dica pros próximos Salvar
    try {
      return readContainer(zipBytes);
    } catch (e) {
      toast.error((e as Error).message ?? "Não foi possível ler o contêiner .vistage.");
      return null;
    }
  }

  if (isZip(bytes)) {
    setDocPassword(null); // contêiner sem senha
    try {
      return readContainer(bytes);
    } catch (e) {
      toast.error((e as Error).message ?? "Não foi possível ler o contêiner .vistage.");
      return null;
    }
  }
  const raw = strFromU8(bytes);
  if (!isEncryptedRaw(raw)) {
    setDocPassword(null); // documento sem senha
    return parseBackupRaw(raw);
  }
  const pw = await promptPassword({
    title: "Documento protegido",
    description: "Este arquivo .vistage está protegido por senha. Digite-a para abrir.",
    confirmLabel: "Abrir",
  });
  if (pw == null) return null; // cancelou
  let text: string;
  try {
    text = await decryptString(raw, pw);
  } catch (e) {
    toast.error((e as Error).message ?? "Não foi possível decifrar o arquivo.");
    return null;
  }
  setDocPassword(pw); // lembra pra re-cifrar nos próximos Salvar
  return parseBackupRaw(text);
}

/** Abre o diálogo "Salvar como" e grava o documento. Retorna o caminho. */
export async function exportBackupToFile(): Promise<string | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const path = await saveDialog({
    title: "Salvar documento do Vistage",
    defaultPath: `Vistage ${stamp}.vistage`,
    filters: [{ name: "Documento Vistage", extensions: ["vistage"] }],
  });
  if (!path) return null;
  await saveBackupToPath(path);
  return path;
}

/** Abre o diálogo de seleção e retorna o documento + caminho (decifrando se preciso). */
export async function pickBackupFile(): Promise<{ backup: Backup; path: string } | null> {
  const file = await openDialog({
    multiple: false,
    title: "Abrir documento do Vistage",
    filters: [
      { name: "Documento Vistage", extensions: ["vistage", "json"] },
    ],
  });
  if (!file || typeof file !== "string") return null;
  const backup = await readMaybeEncrypted(file);
  if (!backup) return null;
  return { backup, path: file };
}

/**
 * **Operação destrutiva**: limpa todas as tabelas e reescreve com os
 * dados do backup.
 *
 * IMPORTANTE: nada de BEGIN/COMMIT/ROLLBACK manual aqui. O tauri-plugin-sql
 * usa um pool de conexões; uma transação aberta numa conexão enquanto os
 * comandos seguintes caem em outras gera "cannot rollback - no transaction
 * is active" e deixa o banco travado ("database is locked"). Cada execute é
 * atômico por si só. Para preservar consistência, limpamos tudo primeiro e
 * só então reinserimos; um erro no meio é propagado para a UI avisar.
 */
/**
 * Colunas de foreign key ANULÁVEIS que são inseridas como NULL na primeira
 * passagem e restauradas numa segunda passagem (apenas se o id referenciado
 * existir). Isso torna o restore imune a:
 *  - ordem de inserção entre tabelas (inclui ciclos: gigs↔tasks)
 *  - referências órfãs (parent ausente no backup) → ficam NULL em vez de quebrar
 *  - PRAGMA foreign_keys instável no pool de conexões do tauri-plugin-sql
 *
 * Colunas FK NOT NULL / parte de PK não entram aqui: são satisfeitas pela
 * ordem topológica de TABLES (pais antes de filhos).
 *
 * Formato: { tabela: { coluna: tabelaReferenciada } }
 */
const DEFERRED_FK: Partial<Record<TableName, Record<string, TableName>>> = {
  contacts: { venue_id: "venues" },
  gigs: {
    promoter_contact_id: "contacts",
    venue_id: "venues",
    main_goal_task_id: "tasks",
  },
  tasks: { gig_id: "gigs", contact_id: "contacts" },
  finance_transactions: {
    category_id: "finance_categories",
    gig_id: "gigs",
    contact_id: "contacts",
  },
  finance_recurring: { category_id: "finance_categories" },
  equipment: { transaction_id: "finance_transactions" },
  fan_group_members: { fan_id: "fans" },
  student_packages: { package_id: "class_packages" },
  classes: { student_package_id: "student_packages" },
  party_tasks: { stage_id: "party_stages" },
  music_project_costs: { project_id: "music_projects", track_id: "tracks" },
  // Biblioteca: ideas é inserida ANTES de notes (está no topo de TABLES), então
  // source_note_id é adiado p/ a 2ª passagem. note_folders.parent_id é self-ref.
  ideas: { source_note_id: "notes" },
  note_folders: { parent_id: "note_folders" },
  // setlist: a faixa da biblioteca é anulável (ON DELETE SET NULL preserva o snapshot)
  gig_library_tracks: { library_track_id: "library_tracks" },
};

export async function restoreBackup(backup: Backup): Promise<{
  restoredTables: number;
  restoredRows: number;
}> {
  const db = getDb();
  let restoredRows = 0;

  // Conjunto de ids presentes no backup por tabela — usado na 2ª passagem
  // para só restaurar FKs cujo parent realmente existe (descarta órfãos).
  const idsByTable = new Map<string, Set<unknown>>();
  for (const t of TABLES) {
    const set = new Set<unknown>();
    for (const row of backup.tables[t] ?? []) {
      if (row["id"] != null) set.add(row["id"]);
    }
    idsByTable.set(t, set);
  }

  // Apenas tabelas presentes no backup (chave existe). Tabelas ausentes são
  // ignoradas na limpeza e inserção para não apagar dados de versões mais novas.
  const tablesInBackup = new Set(
    TABLES.filter((t) => Object.prototype.hasOwnProperty.call(backup.tables, t))
  );

  // Colunas reais de cada tabela no banco atual — protege contra backups de
  // versões diferentes do app (colunas a mais ou a menos no backup).
  const tableColumns = new Map<string, Set<string>>();
  for (const t of TABLES) {
    if (!tablesInBackup.has(t)) continue;
    const info = await db.select<{ name: string }[]>(`PRAGMA table_info(${t})`);
    tableColumns.set(t, new Set(info.map((r) => r.name)));
  }

  // Monta TODOS os statements (limpeza + 2 passagens) num ÚNICO lote atômico.
  // Antes era um execute por linha sem transação: um erro no meio deixava o
  // banco meio-apagado/meio-restaurado. Agora é tudo-ou-nada — se algo falhar,
  // o Rust faz ROLLBACK e os dados originais ficam intactos.
  const stmts: BatchStatement[] = [];

  // limpa na ordem inversa (filhos antes de pais) — só tabelas do backup
  for (const t of [...TABLES].reverse()) {
    if (!tablesInBackup.has(t)) continue;
    stmts.push({ sql: `DELETE FROM ${t}` });
  }

  // 1ª passagem: insere na ordem topológica, omitindo as colunas FK
  // anuláveis (DEFERRED_FK) — elas entram como NULL.
  // Também filtra colunas que não existem no schema atual.
  for (const t of TABLES) {
    if (!tablesInBackup.has(t)) continue;
    const rows = backup.tables[t] ?? [];
    const deferred = DEFERRED_FK[t] ?? {};
    const existingCols = tableColumns.get(t) ?? new Set<string>();
    for (const row of rows) {
      const insertCols = Object.keys(row).filter(
        (c) => !(c in deferred) && existingCols.has(c)
      );
      if (insertCols.length === 0) continue;
      const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
      const values = insertCols.map((c) => row[c]);
      stmts.push({
        sql: `INSERT INTO ${t} (${insertCols.join(", ")}) VALUES (${placeholders})`,
        params: values,
      });
      restoredRows += 1;
    }
  }

  // 2ª passagem: restaura as colunas FK adiadas, somente quando o id
  // referenciado existe na sua tabela (caso contrário, mantém NULL).
  for (const t of TABLES) {
    if (!tablesInBackup.has(t)) continue;
    const deferred = DEFERRED_FK[t];
    if (!deferred) continue;
    const rows = backup.tables[t] ?? [];
    const existingCols = tableColumns.get(t) ?? new Set<string>();
    for (const row of rows) {
      const id = row["id"];
      if (id == null) continue;
      for (const [col, refTable] of Object.entries(deferred)) {
        if (!existingCols.has(col)) continue; // coluna não existe nesta versão
        const val = row[col];
        if (val == null) continue;
        if (!idsByTable.get(refTable)?.has(val)) continue; // órfão → deixa NULL
        stmts.push({
          sql: `UPDATE ${t} SET ${col} = $1 WHERE id = $2`,
          params: [val, id],
        });
      }
    }
  }

  // PRAGMA foreign_keys fica FORA da transação (é no-op dentro de uma). Como a
  // conexão libsql é única e persistente, o OFF vale para o lote inteiro; só
  // os ids cujo parent existe são religados, então não há violação de FK.
  await db.execute("PRAGMA foreign_keys = OFF");
  try {
    await db.executeBatch(stmts);
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }

  // Restaura arquivos de anexo (v2+) para o uploadsDir atual
  const uploadsDir = useConfigStore.getState().config?.uploadsDir ?? "";
  if (backup.files && Object.keys(backup.files).length > 0) {
    if (uploadsDir) {
      await restoreFiles(backup.files, uploadsDir).catch(() => {});
    }
  }

  // Rewrite file path columns to use the current uploadsDir
  if (backup.files && backup.uploadsDir && uploadsDir && backup.uploadsDir !== uploadsDir) {
    const oldDir = backup.uploadsDir.replace(/[\\/]+$/, "");
    const newDir = uploadsDir.replace(/[\\/]+$/, "");
    for (const [table, cols] of Object.entries(FILE_PATH_COLS) as [TableName, string[]][]) {
      const rows = backup.tables[table] ?? [];
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const col of cols) {
          const val = row[col];
          if (typeof val !== "string" || !val) continue;
          const normVal = val.replace(/\\/g, "/");
          const normOld = oldDir.replace(/\\/g, "/");
          if (!normVal.startsWith(normOld)) continue;
          const rel = normVal.slice(normOld.length).replace(/^\//, "");
          const newPath = joinPath(newDir, rel);
          await db.execute(
            `UPDATE ${table} SET ${col} = $1 WHERE id = $2`,
            [newPath, id]
          );
        }
      }
    }
    for (const [table, cols] of Object.entries(FILE_PATH_JSON_COLS) as [TableName, string[]][]) {
      const rows = backup.tables[table] ?? [];
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const col of cols) {
          const raw = row[col];
          if (typeof raw !== "string" || !raw) continue;
          let paths: unknown[];
          try { paths = JSON.parse(raw); } catch { continue; }
          const updated = paths.map((p) => {
            if (typeof p !== "string") return p;
            const normP = p.replace(/\\/g, "/");
            const normOld = oldDir.replace(/\\/g, "/");
            if (!normP.startsWith(normOld)) return p;
            const rel = normP.slice(normOld.length).replace(/^\//, "");
            return joinPath(newDir, rel);
          });
          await db.execute(
            `UPDATE ${table} SET ${col} = $1 WHERE id = $2`,
            [JSON.stringify(updated), id]
          );
        }
      }
    }
    // arrays de OBJETOS com caminho (galeria/fontes da Identidade)
    for (const [table, specs] of Object.entries(FILE_PATH_JSON_OBJECT_COLS) as [
      TableName,
      { col: string; pathKey: string }[]
    ][]) {
      const rows = backup.tables[table] ?? [];
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const { col, pathKey } of specs) {
          const raw = row[col];
          if (typeof raw !== "string" || !raw) continue;
          let arr: unknown[];
          try { arr = JSON.parse(raw); } catch { continue; }
          let changed = false;
          const updated = arr.map((item) => {
            if (!item || typeof item !== "object") return item;
            const obj = item as Record<string, unknown>;
            const p = obj[pathKey];
            if (typeof p !== "string") return item;
            const normP = p.replace(/\\/g, "/");
            const normOld = oldDir.replace(/\\/g, "/");
            if (!normP.startsWith(normOld)) return item;
            const rel = normP.slice(normOld.length).replace(/^\//, "");
            changed = true;
            return { ...obj, [pathKey]: joinPath(newDir, rel) };
          });
          if (changed) {
            await db.execute(
              `UPDATE ${table} SET ${col} = $1 WHERE id = $2`,
              [JSON.stringify(updated), id]
            );
          }
        }
      }
    }
  }

  return { restoredTables: tablesInBackup.size, restoredRows };
}
