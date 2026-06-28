import { invoke } from "@tauri-apps/api/core";
import { getDb, type BatchStatement } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";

// Biblioteca de Músicas — espelho consultável da biblioteca real. O áudio NUNCA
// entra no .vistage: guardamos só caminho + metadados. Editar a grade muda o
// banco (persiste no Ctrl+S); "Gravar tags" mexe nos ARQUIVOS (ação física).

export type LibraryTrack = {
  id: number;
  title: string | null;
  artist: string | null;
  genre: string | null;
  bpm: number | null;
  music_key: string | null;
  comments: string | null;
  file_path: string | null;
  file_missing: number;
  duration_sec: number | null;
  match_key: string | null;
  source: string;
  archived_at: string | null;
};

export type ScannedTrack = {
  path: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  bpm: string | null;
  key: string | null;
  comments: string | null;
  duration_sec: number | null;
};

export type ScanDiff = {
  scannedCount: number;
  newTracks: ScannedTrack[];
  moved: { id: number; oldPath: string | null; newPath: string }[];
  missing: LibraryTrack[];
};

// ── helpers ──────────────────────────────────────────────────────────────────
function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
/** Chave estável p/ reconciliar rescans (arquivo movido ≠ órfão). */
export function matchKey(artist: string | null, title: string | null, dur: number | null): string {
  return `${norm(artist)}|${norm(title)}|${dur ?? ""}`;
}
function parseBpm(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? null : n;
}

// ── leitura ──────────────────────────────────────────────────────────────────
export async function listTracks(): Promise<LibraryTrack[]> {
  return getDb().select<LibraryTrack[]>(
    "SELECT * FROM library_tracks WHERE archived_at IS NULL ORDER BY artist, title"
  );
}

// ── scan + reconciliação (diff antes de aplicar — nunca sobrescreve cego) ─────
/**
 * Transforma as faixas escaneadas num ScanDiff (novas / recolocadas / ausentes),
 * confrontando-as com o banco. Separado de `scanReconcile` pra ser reusado pela
 * varredura em segundo plano (que recebe as faixas via evento, não via invoke).
 */
export async function reconcileScanned(scanned: ScannedTrack[], path: string): Promise<ScanDiff> {
  const existing = await listTracks();
  const byPath = new Map(existing.filter((t) => t.file_path).map((t) => [t.file_path!, t]));
  const byMatch = new Map(existing.filter((t) => t.match_key).map((t) => [t.match_key!, t]));
  const scannedPaths = new Set(scanned.map((s) => s.path));

  const newTracks: ScannedTrack[] = [];
  const moved: ScanDiff["moved"] = [];
  for (const s of scanned) {
    if (byPath.has(s.path)) continue; // já correlacionada por caminho exato
    const mk = matchKey(s.artist, s.title, s.duration_sec);
    const m = byMatch.get(mk);
    if (m && (!m.file_path || !scannedPaths.has(m.file_path)) && m.file_path !== s.path) {
      // mesma faixa (artista+título+duração) num caminho novo → moveu/correlaciona
      moved.push({ id: m.id, oldPath: m.file_path, newPath: s.path });
    } else if (!m) {
      newTracks.push(s);
    }
  }
  // ausentes: linhas com arquivo SOB a pasta escaneada que não apareceram
  const movedIds = new Set(moved.map((m) => m.id));
  const missing = existing.filter(
    (t) =>
      t.file_path &&
      t.file_path.startsWith(path) &&
      !scannedPaths.has(t.file_path) &&
      !movedIds.has(t.id)
  );

  return { scannedCount: scanned.length, newTracks, moved, missing };
}

export async function scanReconcile(path: string, includeSubdirs: boolean): Promise<ScanDiff> {
  const scanned = await invoke<ScannedTrack[]>("audio_scan_folder", { path, includeSubdirs });
  return reconcileScanned(scanned, path);
}

export async function applyScan(diff: ScanDiff): Promise<void> {
  const db = getDb();
  // Lote transacional ÚNICO em vez de N round-trips sequenciais: aplicar um scan
  // de milhares de faixas vira UMA transação (um fsync), não milhares — o que
  // travava/arrastava ao importar grandes bibliotecas.
  const stmts: BatchStatement[] = [];
  for (const s of diff.newTracks) {
    const dur = s.duration_sec ?? null;
    stmts.push({
      sql: `INSERT INTO library_tracks
        (title, artist, genre, bpm, music_key, comments, file_path, file_missing, duration_sec, match_key, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,'scan')`,
      params: [s.title, s.artist, s.genre, parseBpm(s.bpm), s.key, s.comments, s.path, dur, matchKey(s.artist, s.title, dur)],
    });
  }
  for (const m of diff.moved) {
    stmts.push({
      sql: "UPDATE library_tracks SET file_path = $1, file_missing = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      params: [m.newPath, m.id],
    });
  }
  if (stmts.length > 0) await db.executeBatch(stmts);
  emitDataChanged();
}

// ── edição da grade (banco; persiste no Ctrl+S) ──────────────────────────────
const EDITABLE = ["title", "artist", "genre", "bpm", "music_key", "comments"] as const;
export type EditableCol = (typeof EDITABLE)[number];

export async function updateCell(id: number, col: EditableCol, value: string): Promise<void> {
  if (!EDITABLE.includes(col)) return;
  const v: unknown = col === "bpm" ? parseBpm(value) : value.trim() === "" ? null : value;
  await getDb().execute(
    `UPDATE library_tracks SET ${col} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [v, id]
  );
  emitDataChanged();
}

export async function addManualRow(): Promise<number> {
  const res = await getDb().execute(
    "INSERT INTO library_tracks (source, file_missing) VALUES ('manual', 0)"
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

/** Correlaciona uma linha (sem arquivo) a um arquivo escolhido — lê suas tags. */
export async function correlate(id: number, filePath: string): Promise<void> {
  const t = await invoke<ScannedTrack>("audio_read_tags", { path: filePath }).catch(() => null);
  const db = getDb();
  if (t) {
    await db.execute(
      `UPDATE library_tracks SET file_path=$1, file_missing=0, duration_sec=$2, match_key=$3,
        title=COALESCE(NULLIF(title,''), $4), artist=COALESCE(NULLIF(artist,''), $5),
        genre=COALESCE(NULLIF(genre,''), $6), bpm=COALESCE(bpm, $7), music_key=COALESCE(NULLIF(music_key,''), $8),
        comments=COALESCE(NULLIF(comments,''), $9), updated_at=CURRENT_TIMESTAMP WHERE id=$10`,
      [filePath, t.duration_sec, matchKey(t.artist, t.title, t.duration_sec), t.title, t.artist, t.genre, parseBpm(t.bpm), t.key, t.comments, id]
    );
  } else {
    await db.execute(
      "UPDATE library_tracks SET file_path = $1, file_missing = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [filePath, id]
    );
  }
  emitDataChanged();
}

/** Verifica existência dos arquivos em lote → atualiza file_missing. */
export async function verifyFiles(): Promise<{ missing: number }> {
  const db = getDb();
  const rows = await db.select<{ id: number; file_path: string }[]>(
    "SELECT id, file_path FROM library_tracks WHERE archived_at IS NULL AND file_path IS NOT NULL"
  );
  if (rows.length === 0) return { missing: 0 };
  const exists = await invoke<boolean[]>("audio_paths_exist", { paths: rows.map((r) => r.file_path) });
  let missing = 0;
  // Um único lote transacional em vez de N UPDATEs sequenciais (verificar uma
  // biblioteca grande não arrasta mais).
  const stmts: BatchStatement[] = [];
  for (let i = 0; i < rows.length; i++) {
    const flag = exists[i] ? 0 : 1;
    if (!exists[i]) missing += 1;
    stmts.push({ sql: "UPDATE library_tracks SET file_missing = $1 WHERE id = $2", params: [flag, rows[i].id] });
  }
  if (stmts.length > 0) await db.executeBatch(stmts);
  emitDataChanged();
  return { missing };
}

// ── gravar tags nos ARQUIVOS (ação física, irreversível no arquivo) ──────────
export type WriteResult = { ok: number; failed: { id: number; title: string; error: string }[] };

/**
 * Grava nos arquivos os campos das linhas dadas. `includeComments` controla se o
 * COMM é gravado (salvaguarda: só quando o usuário editou a célula de comentário).
 * Relê após gravar (o Rust já devolve os valores efetivos).
 */
export async function writeTagsToFiles(
  ids: number[],
  includeComments: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<WriteResult> {
  const db = getDb();
  const result: WriteResult = { ok: 0, failed: [] };
  const rows = await db.select<LibraryTrack[]>(
    `SELECT * FROM library_tracks WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(",")}) AND file_path IS NOT NULL`,
    ids
  );
  let done = 0;
  for (const t of rows) {
    const fields: Record<string, string | undefined> = {
      title: t.title ?? "",
      artist: t.artist ?? "",
      genre: t.genre ?? "",
      bpm: t.bpm != null ? String(Math.round(t.bpm)) : "",
      key: t.music_key ?? "",
    };
    if (includeComments) fields.comments = t.comments ?? "";
    try {
      await invoke("audio_write_tags", { path: t.file_path, fields });
      result.ok += 1;
    } catch (e) {
      result.failed.push({ id: t.id, title: t.title ?? t.file_path ?? "(sem título)", error: String(e) });
    }
    done += 1;
    onProgress?.(done, rows.length);
  }
  return result;
}

// ── exclusão preservando GIG ─────────────────────────────────────────────────
export async function deleteTrack(id: number): Promise<"archived" | "deleted"> {
  const db = getDb();
  const refs = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM gig_library_tracks WHERE library_track_id = $1",
    [id]
  );
  if ((refs[0]?.n ?? 0) > 0) {
    await db.execute(
      "UPDATE library_tracks SET archived_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );
    emitDataChanged();
    return "archived";
  }
  await db.execute("DELETE FROM library_tracks WHERE id = $1", [id]);
  emitDataChanged();
  return "deleted";
}

// ── setlist do GIG (faixa da biblioteca + snapshot do que foi tocado) ─────────
export type GigLibraryTrack = {
  id: number;
  library_track_id: number | null;
  played_title: string | null;
  played_artist: string | null;
  position: number;
};

export async function listGigLibraryTracks(gigId: number): Promise<GigLibraryTrack[]> {
  return getDb().select<GigLibraryTrack[]>(
    "SELECT id, library_track_id, played_title, played_artist, position FROM gig_library_tracks WHERE gig_id = $1 ORDER BY position, id",
    [gigId]
  );
}

export async function addGigLibraryTrack(gigId: number, track: LibraryTrack): Promise<void> {
  await getDb().execute(
    `INSERT INTO gig_library_tracks (gig_id, library_track_id, played_title, played_artist, position)
     VALUES ($1,$2,$3,$4,(SELECT COALESCE(MAX(position),0)+1 FROM gig_library_tracks WHERE gig_id=$1))`,
    [gigId, track.id, track.title, track.artist]
  );
  emitDataChanged();
}

export async function removeGigLibraryTrack(rowId: number): Promise<void> {
  await getDb().execute("DELETE FROM gig_library_tracks WHERE id = $1", [rowId]);
  emitDataChanged();
}
