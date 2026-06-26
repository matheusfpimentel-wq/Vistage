import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  deleteDriveFile,
  listDriveFolder,
  uploadToDriveFolder,
  type DriveFile,
} from "@/lib/gdrive";
import { bytesToBase64 } from "@/lib/uploads";
import { gigDisplayName } from "@/modules/gigs/displayName";

// Biblioteca de Documentos — pasta designada do Google Drive (contratos, modelos,
// rider técnico). Não embute nada no .vistage: referência + associação a um GIG.

const FOLDER_KEY = "drive_documents_folder_id";

const DOC_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  rtf: "application/rtf",
  md: "text/markdown",
  csv: "text/csv",
  odt: "application/vnd.oasis.opendocument.text",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function getDocFolderId(): Promise<string | null> {
  const rows = await getDb().select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [FOLDER_KEY]
  );
  return rows[0]?.value ?? null;
}

export async function setDocFolderId(id: string | null): Promise<void> {
  const db = getDb();
  if (!id || !id.trim()) {
    await db.execute("DELETE FROM app_settings WHERE key = $1", [FOLDER_KEY]);
  } else {
    await db.execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [FOLDER_KEY, id.trim()]
    );
  }
  emitDataChanged();
}

export type { DriveFile };

/** Lista a pasta no Drive (ao vivo). Requer escopo readonly + conexão. */
export async function listFolderDocs(folderId: string): Promise<DriveFile[]> {
  return listDriveFolder(folderId);
}

export async function openDoc(link: string | null): Promise<void> {
  if (link) await openExternal(link);
}

/** Escolhe arquivos locais e os sobe pra pasta do Drive. Devolve quantos subiram. */
export async function uploadDocsToFolder(folderId: string): Promise<number> {
  const picked = await openDialog({ multiple: true, title: "Enviar documentos pro Drive" });
  if (!picked) return 0;
  const paths = Array.isArray(picked) ? picked : [picked];
  let n = 0;
  for (const p of paths) {
    const name = p.split(/[\\/]/).pop() ?? "arquivo";
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const bytes = await readFile(p);
    const mime = DOC_MIME[ext] ?? "application/octet-stream";
    await uploadToDriveFolder(folderId, name, bytesToBase64(bytes), mime);
    n++;
  }
  if (n > 0) emitDataChanged();
  return n;
}

/** Exclui o arquivo no Drive e limpa o cache/vínculos locais dele. */
export async function deleteDoc(driveFileId: string): Promise<void> {
  await deleteDriveFile(driveFileId);
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM drive_documents WHERE drive_file_id = $1",
    [driveFileId]
  );
  if (rows[0]) {
    await db.execute("DELETE FROM document_links WHERE drive_document_id = $1", [rows[0].id]);
    await db.execute("DELETE FROM drive_documents WHERE id = $1", [rows[0].id]);
  }
  emitDataChanged();
}

/** Garante uma linha no cache drive_documents (sem apagar associações) e devolve o id local. */
async function ensureDriveDoc(f: DriveFile): Promise<number> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM drive_documents WHERE drive_file_id = $1",
    [f.id]
  );
  if (existing[0]) {
    await db.execute(
      "UPDATE drive_documents SET name=$1, mime_type=$2, web_view_link=$3, modified_time=$4, cached_at=CURRENT_TIMESTAMP WHERE id=$5",
      [f.name, f.mime_type, f.web_view_link, f.modified_time, existing[0].id]
    );
    return existing[0].id;
  }
  const res = await db.execute(
    "INSERT INTO drive_documents (drive_file_id, name, mime_type, web_view_link, modified_time) VALUES ($1,$2,$3,$4,$5)",
    [f.id, f.name, f.mime_type, f.web_view_link, f.modified_time]
  );
  return Number(res.lastInsertId);
}

export type EntityRef = { type: "gig"; id: number; label: string };

/** GIGs pra associar um documento (ex.: o contrato daquele evento). */
export async function gigOptions(): Promise<EntityRef[]> {
  const rows = await getDb().select<
    { id: number; venue_name: string; event_name: string | null; recurring_event_name: string | null; date: string }[]
  >("SELECT id, venue_name, event_name, recurring_event_name, date FROM gigs ORDER BY date DESC LIMIT 300");
  return rows.map((g) => ({ type: "gig", id: g.id, label: `${gigDisplayName(g)} · ${g.date}` }));
}

export async function associateDoc(f: DriveFile, entityType: "gig", entityId: number): Promise<void> {
  const docId = await ensureDriveDoc(f);
  await getDb().execute(
    "INSERT INTO document_links (drive_document_id, entity_type, entity_id) VALUES ($1, $2, $3)",
    [docId, entityType, entityId]
  );
  emitDataChanged();
}

export type DocLink = { id: number; entity_type: string; entity_id: number; label: string };

/** Associações de um arquivo (resolve o nome da GIG quando for o caso). */
export async function linksForDoc(driveFileId: string): Promise<DocLink[]> {
  const db = getDb();
  const links = await db.select<{ id: number; entity_type: string; entity_id: number }[]>(
    `SELECT dl.id, dl.entity_type, dl.entity_id FROM document_links dl
       JOIN drive_documents dd ON dd.id = dl.drive_document_id
      WHERE dd.drive_file_id = $1 ORDER BY dl.id`,
    [driveFileId]
  );
  const out: DocLink[] = [];
  for (const l of links) {
    let label = `${l.entity_type} #${l.entity_id}`;
    if (l.entity_type === "gig") {
      const g = await db.select<{ venue_name: string; event_name: string | null; recurring_event_name: string | null; date: string }[]>(
        "SELECT venue_name, event_name, recurring_event_name, date FROM gigs WHERE id = $1",
        [l.entity_id]
      );
      if (g[0]) label = gigDisplayName(g[0]);
    }
    out.push({ ...l, label });
  }
  return out;
}

export async function removeLink(id: number): Promise<void> {
  await getDb().execute("DELETE FROM document_links WHERE id = $1", [id]);
  emitDataChanged();
}
