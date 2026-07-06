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
import {
  ENTITY_LINK_LABELS,
  isEntityLinkType,
  loadEntityOptions,
  resolveEntityLabel,
  type EntityLinkType,
  type EntityOption,
} from "@/lib/entityLinks";

// Biblioteca de Documentos — pasta designada do Google Drive (contratos, modelos,
// rider técnico). Não embute nada no .vistage: referência + associação polimórfica
// (entity_type/entity_id) a QUALQUER entidade (GIG, festa, contato, track…).

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

export type { EntityLinkType, EntityOption };
export { ENTITY_LINK_LABELS };

/** Opções de uma entidade pra associar um documento (ex.: as GIGs, as festas…). */
export async function entityOptions(type: EntityLinkType): Promise<EntityOption[]> {
  return loadEntityOptions(type);
}

/** Vincula o arquivo do Drive a uma entidade qualquer. Idempotente (INSERT OR
 *  IGNORE + índice único): revincular o mesmo par não duplica. `label` é
 *  cacheado pra a leitura não precisar reabrir a lista da entidade. */
export async function associateDoc(
  f: DriveFile,
  entityType: EntityLinkType,
  entityId: number,
  label?: string
): Promise<void> {
  const docId = await ensureDriveDoc(f);
  await getDb().execute(
    "INSERT OR IGNORE INTO document_links (drive_document_id, entity_type, entity_id, label) VALUES ($1, $2, $3, $4)",
    [docId, entityType, entityId, label ?? null]
  );
  emitDataChanged();
}

export type DocLink = { id: number; entity_type: string; entity_id: number; label: string };

/** Associações de um arquivo. Usa o label cacheado; se faltar (vínculos antigos,
 *  pré-migration), resolve na hora pelo tipo/id. */
export async function linksForDoc(driveFileId: string): Promise<DocLink[]> {
  const db = getDb();
  const links = await db.select<{ id: number; entity_type: string; entity_id: number; label: string | null }[]>(
    `SELECT dl.id, dl.entity_type, dl.entity_id, dl.label FROM document_links dl
       JOIN drive_documents dd ON dd.id = dl.drive_document_id
      WHERE dd.drive_file_id = $1 ORDER BY dl.id`,
    [driveFileId]
  );
  const out: DocLink[] = [];
  for (const l of links) {
    let label = l.label ?? "";
    if (!label) {
      label = isEntityLinkType(l.entity_type)
        ? await resolveEntityLabel(l.entity_type, l.entity_id)
        : `${l.entity_type} #${l.entity_id}`;
    }
    out.push({ id: l.id, entity_type: l.entity_type, entity_id: l.entity_id, label });
  }
  return out;
}

/** Vínculos de documento apontando pra uma entidade (para um painel "Documentos
 *  desta GIG/festa/…" ou consulta inversa). */
export async function documentsLinkedTo(entityType: EntityLinkType, entityId: number): Promise<
  { link_id: number; drive_file_id: string; name: string | null; web_view_link: string | null; mime_type: string | null }[]
> {
  return getDb().select(
    `SELECT dl.id AS link_id, dd.drive_file_id, dd.name, dd.web_view_link, dd.mime_type
       FROM document_links dl JOIN drive_documents dd ON dd.id = dl.drive_document_id
      WHERE dl.entity_type = $1 AND dl.entity_id = $2 ORDER BY dd.name`,
    [entityType, entityId]
  );
}

export async function removeLink(id: number): Promise<void> {
  await getDb().execute("DELETE FROM document_links WHERE id = $1", [id]);
  emitDataChanged();
}

/** Limpa vínculos órfãos quando a entidade referenciada é excluída (o lado
 *  polimórfico não tem FK). Espelha unlinkTasksFromEntity das tarefas. */
export async function unlinkDocumentsFromEntity(entityType: EntityLinkType, entityId: number): Promise<void> {
  await getDb().execute(
    "DELETE FROM document_links WHERE entity_type = $1 AND entity_id = $2",
    [entityType, entityId]
  );
  emitDataChanged();
}
