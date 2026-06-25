import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { createIdea } from "@/modules/ideas/api";

// ── Tipos ────────────────────────────────────────────────────────────────────
export type NoteFolder = {
  id: number;
  name: string;
  parent_id: number | null;
  sort: number;
};
export type NoteSummary = {
  id: number;
  title: string;
  folder_id: number | null;
  pinned: number;
  updated_at: string;
};
export type Note = NoteSummary & {
  body: string;
  created_at: string;
  tags: string[];
};
export type NoteRef = { id: number; title: string };

// ── Pastas ───────────────────────────────────────────────────────────────────
export async function listFolders(): Promise<NoteFolder[]> {
  return getDb().select<NoteFolder[]>(
    "SELECT id, name, parent_id, sort FROM note_folders ORDER BY sort, name"
  );
}

export async function createFolder(name: string, parentId: number | null = null): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "INSERT INTO note_folders (name, parent_id) VALUES ($1, $2)",
    [name.trim() || "Nova pasta", parentId]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function renameFolder(id: number, name: string): Promise<void> {
  await getDb().execute("UPDATE note_folders SET name = $1 WHERE id = $2", [name.trim(), id]);
  emitDataChanged();
}

export async function moveFolder(id: number, parentId: number | null): Promise<void> {
  // Evita ciclo trivial (pasta como pai dela mesma).
  if (parentId === id) return;
  await getDb().execute("UPDATE note_folders SET parent_id = $1 WHERE id = $2", [parentId, id]);
  emitDataChanged();
}

export async function deleteFolder(id: number): Promise<void> {
  // FK ON DELETE SET NULL: notas e subpastas ficam "soltas" (folder_id/parent NULL).
  await getDb().execute("DELETE FROM note_folders WHERE id = $1", [id]);
  emitDataChanged();
}

// ── Notas ────────────────────────────────────────────────────────────────────
export async function listNotes(folderId?: number | "all" | "loose"): Promise<NoteSummary[]> {
  const db = getDb();
  let where = "";
  const params: unknown[] = [];
  if (folderId === "loose") {
    where = "WHERE folder_id IS NULL";
  } else if (typeof folderId === "number") {
    where = "WHERE folder_id = $1";
    params.push(folderId);
  }
  return db.select<NoteSummary[]>(
    `SELECT id, title, folder_id, pinned, updated_at FROM notes ${where}
      ORDER BY pinned DESC, updated_at DESC`,
    params
  );
}

export async function getNote(id: number): Promise<Note | null> {
  const db = getDb();
  const rows = await db.select<Omit<Note, "tags">[]>(
    "SELECT id, title, body, folder_id, pinned, created_at, updated_at FROM notes WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;
  const tags = await db.select<{ name: string }[]>(
    `SELECT t.name FROM note_tags t
       JOIN note_note_tags nt ON nt.tag_id = t.id
      WHERE nt.note_id = $1 ORDER BY t.name`,
    [id]
  );
  return { ...rows[0], tags: tags.map((t) => t.name) };
}

export async function createNote(folderId: number | null = null): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "INSERT INTO notes (title, body, folder_id) VALUES ('', '', $1)",
    [folderId]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function deleteNote(id: number): Promise<void> {
  // CASCADE limpa note_note_tags e note_links (origem e destino).
  await getDb().execute("DELETE FROM notes WHERE id = $1", [id]);
  emitDataChanged();
}

export async function setPinned(id: number, pinned: boolean): Promise<void> {
  await getDb().execute("UPDATE notes SET pinned = $1 WHERE id = $2", [pinned ? 1 : 0, id]);
  emitDataChanged();
}

export async function moveNote(id: number, folderId: number | null): Promise<void> {
  await getDb().execute("UPDATE notes SET folder_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [folderId, id]);
  emitDataChanged();
}

/**
 * Salva título+corpo e RECALCULA derivados a partir do corpo:
 *  - backlinks: parseia [[wikilinks]] → note_links (só os que resolvem a uma nota).
 *  - tags inline: parseia #tags → note_tags + note_note_tags.
 * Link quebrado (nota inexistente) é ignorado, não vira erro.
 */
export async function saveNote(id: number, title: string, body: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE notes SET title = $1, body = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
    [title, body, id]
  );
  await recomputeLinks(db, id, body);
  await recomputeInlineTags(db, id, body);
  emitDataChanged();
}

async function recomputeLinks(db: ReturnType<typeof getDb>, sourceId: number, body: string): Promise<void> {
  const titles = parseWikilinks(body);
  await db.execute("DELETE FROM note_links WHERE source_note_id = $1", [sourceId]);
  if (titles.length === 0) return;
  const seen = new Set<number>();
  for (const t of titles) {
    const rows = await db.select<{ id: number }[]>(
      "SELECT id FROM notes WHERE lower(title) = lower($1) LIMIT 1",
      [t]
    );
    const target = rows[0]?.id;
    if (!target || target === sourceId || seen.has(target)) continue;
    seen.add(target);
    await db.execute(
      "INSERT OR IGNORE INTO note_links (source_note_id, target_note_id) VALUES ($1, $2)",
      [sourceId, target]
    );
  }
}

async function recomputeInlineTags(db: ReturnType<typeof getDb>, noteId: number, body: string): Promise<void> {
  const names = parseInlineTags(body);
  await db.execute("DELETE FROM note_note_tags WHERE note_id = $1", [noteId]);
  for (const name of names) {
    await db.execute("INSERT OR IGNORE INTO note_tags (name) VALUES ($1)", [name]);
    const rows = await db.select<{ id: number }[]>("SELECT id FROM note_tags WHERE name = $1", [name]);
    const tagId = rows[0]?.id;
    if (tagId) {
      await db.execute(
        "INSERT OR IGNORE INTO note_note_tags (note_id, tag_id) VALUES ($1, $2)",
        [noteId, tagId]
      );
    }
  }
}

/** Notas que mencionam ESTA nota (backlinks), via note_links. */
export async function backlinks(noteId: number): Promise<NoteRef[]> {
  return getDb().select<NoteRef[]>(
    `SELECT n.id, n.title FROM note_links l
       JOIN notes n ON n.id = l.source_note_id
      WHERE l.target_note_id = $1 ORDER BY n.updated_at DESC`,
    [noteId]
  );
}

/** Todos os títulos (para autocomplete de [[ ). */
export async function allNoteTitles(): Promise<NoteRef[]> {
  return getDb().select<NoteRef[]>(
    "SELECT id, title FROM notes WHERE title != '' ORDER BY title"
  );
}

export async function listTags(): Promise<string[]> {
  const rows = await getDb().select<{ name: string }[]>(
    `SELECT DISTINCT t.name FROM note_tags t
       JOIN note_note_tags nt ON nt.tag_id = t.id ORDER BY t.name`
  );
  return rows.map((r) => r.name);
}

export async function notesByTag(tag: string): Promise<NoteSummary[]> {
  return getDb().select<NoteSummary[]>(
    `SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at FROM notes n
       JOIN note_note_tags nt ON nt.note_id = n.id
       JOIN note_tags t ON t.id = nt.tag_id
      WHERE t.name = $1 ORDER BY n.pinned DESC, n.updated_at DESC`,
    [tag]
  );
}

/**
 * Lâmpada: transforma a nota em Ideia, carregando a procedência (source_note_id).
 * A nota permanece; uma nota pode gerar várias ideias. Retorna o id da ideia.
 */
export async function noteToIdea(note: Note): Promise<number> {
  return createIdea({
    title: note.title || "Ideia da Biblioteca",
    body: note.body || null,
    category: null,
    tags: note.tags,
    heat: 1,
    maturation: "Embrião",
    converted_to: null,
    converted_id: null,
    source_note_id: note.id,
  });
}

// ── Parsers ──────────────────────────────────────────────────────────────────
export function parseWikilinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}

export function parseInlineTags(body: string): string[] {
  const out = new Set<string>();
  // #tag (letras/números/_/- ), não captura "# título" markdown (exige caractere colado).
  const re = /(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}
