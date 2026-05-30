import { getDb } from "@/lib/db";
import type {
  ArtistIdentity,
  ArtistIdentityInput,
  ArtistTemplate,
  ArtistTemplateCreateInput,
  SocialLink,
} from "./types";

type IdentityRow = Omit<ArtistIdentity, "socials"> & { socials: string | null };

function rowToIdentity(r: IdentityRow): ArtistIdentity {
  let socials: SocialLink[] = [];
  if (r.socials) {
    try {
      socials = JSON.parse(r.socials) as SocialLink[];
    } catch {
      socials = [];
    }
  }
  return { ...r, socials };
}

export async function loadIdentity(): Promise<ArtistIdentity> {
  const db = getDb();
  const rows = await db.select<IdentityRow[]>(
    "SELECT * FROM artist_identity WHERE id = 1"
  );
  if (rows[0]) return rowToIdentity(rows[0]);
  // primeira vez: cria registro vazio
  await db.execute(
    `INSERT OR IGNORE INTO artist_identity (id, socials) VALUES (1, '[]')`
  );
  const after = await db.select<IdentityRow[]>(
    "SELECT * FROM artist_identity WHERE id = 1"
  );
  return rowToIdentity(after[0]);
}

export async function saveIdentity(input: ArtistIdentityInput): Promise<void> {
  const db = getDb();
  const payload = { ...input, socials: JSON.stringify(input.socials ?? []) };
  await db.execute(
    `INSERT OR IGNORE INTO artist_identity (id, socials) VALUES (1, '[]')`
  );
  const cols = Object.keys(payload);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  await db.execute(
    `UPDATE artist_identity SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    values
  );
}

// ============================================================
// Templates
// ============================================================

export async function listTemplates(): Promise<ArtistTemplate[]> {
  const db = getDb();
  return db.select<ArtistTemplate[]>(
    "SELECT * FROM artist_templates ORDER BY category, name COLLATE NOCASE ASC"
  );
}

export async function createTemplate(
  input: ArtistTemplateCreateInput
): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO artist_templates (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateTemplate(
  id: number,
  input: Partial<ArtistTemplateCreateInput>
): Promise<void> {
  const db = getDb();
  const cols = Object.keys(input);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE artist_templates SET ${sets} WHERE id = $${values.length}`,
    values
  );
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM artist_templates WHERE id = $1", [id]);
}
