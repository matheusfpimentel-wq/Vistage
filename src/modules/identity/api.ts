import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  ArtistIdentity,
  ArtistIdentityInput,
  ArtistTemplate,
  ArtistTemplateCreateInput,
  SocialLink,
} from "./types";

type IdentityRow = Omit<
  ArtistIdentity,
  "socials" | "palette" | "fonts" | "photos" | "folder_links"
> & {
  socials: string | null;
  palette: string | null;
  fonts: string | null;
  photos: string | null;
  folder_links: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
};

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function rowToIdentity(r: IdentityRow): ArtistIdentity {
  let socials: SocialLink[] = [];
  if (r.socials) {
    try {
      socials = JSON.parse(r.socials) as SocialLink[];
    } catch {
      socials = [];
    }
  }
  let palette: ArtistIdentity["palette"] = [];
  if (r.palette) {
    try {
      palette = JSON.parse(r.palette) as ArtistIdentity["palette"];
    } catch {
      palette = [];
    }
  }
  // migra primary/secondary legados se palette tá vazia
  if (palette.length === 0 && (r.primary_color || r.secondary_color)) {
    if (r.primary_color) palette.push({ hex: r.primary_color, label: "Primária" });
    if (r.secondary_color) palette.push({ hex: r.secondary_color, label: "Secundária" });
  }
  let fonts: ArtistIdentity["fonts"] = [];
  if (r.fonts) {
    try {
      fonts = JSON.parse(r.fonts) as ArtistIdentity["fonts"];
    } catch {
      fonts = [];
    }
  }
  const photos = parseJsonArray<ArtistIdentity["photos"][number]>(r.photos);
  const folder_links = parseJsonArray<ArtistIdentity["folder_links"][number]>(
    r.folder_links
  );
  const { primary_color: _p, secondary_color: _s, ...rest } = r;
  return { ...rest, socials, palette, fonts, photos, folder_links };
}

export async function loadIdentity(): Promise<ArtistIdentity> {
  const db = getDb();
  const rows = await db.select<IdentityRow[]>(
    "SELECT * FROM artist_identity WHERE id = 1"
  );
  if (rows[0]) return rowToIdentity(rows[0]);
  // primeira vez: cria registro vazio
  await db.execute(
    `INSERT OR IGNORE INTO artist_identity (id, socials, palette) VALUES (1, '[]', '[]')`
  );
  const after = await db.select<IdentityRow[]>(
    "SELECT * FROM artist_identity WHERE id = 1"
  );
  return rowToIdentity(after[0]);
}

export async function saveIdentity(input: ArtistIdentityInput): Promise<void> {
  const db = getDb();
  const payload = {
    ...input,
    socials: JSON.stringify(input.socials ?? []),
    palette: JSON.stringify(input.palette ?? []),
    fonts: JSON.stringify(input.fonts ?? []),
    photos: JSON.stringify(input.photos ?? []),
    folder_links: JSON.stringify(input.folder_links ?? []),
  };
  await db.execute(
    `INSERT OR IGNORE INTO artist_identity (id, socials, palette) VALUES (1, '[]', '[]')`
  );
  const cols = Object.keys(payload);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  await db.execute(
    `UPDATE artist_identity SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    values
  );
  emitDataChanged();
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
  emitDataChanged();
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
  emitDataChanged();
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM artist_templates WHERE id = $1", [id]);
  emitDataChanged();
}
