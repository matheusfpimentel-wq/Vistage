import { getDb } from "@/lib/db";

export type SetlistTrack = {
  position: number;
  title: string;
  artist: string;
  bpm: number | null;
  key: string | null;
  duration_sec: number | null;
  genre: string | null;
  comment: string | null;
};

export type ParsedSetlist = {
  tracks: SetlistTrack[];
  source_format: "rekordbox_xml" | "traktor_nml" | "serato_session" | "m3u";
  source_filename: string;
};

export type GigSetlist = {
  id: number;
  gig_id: number;
  source_format: string;
  source_filename: string | null;
  tracks: SetlistTrack[];
  imported_at: string;
};

// ─── Rekordbox XML ────────────────────────────────────────────────────────────

function parseRekordboxXml(content: string, filename: string): ParsedSetlist {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");

  const trackMap = new Map<string, SetlistTrack>();
  const collectionTracks = doc.querySelectorAll("DJ_PLAYLISTS > COLLECTION > TRACK");
  collectionTracks.forEach((el, idx) => {
    const id = el.getAttribute("TrackID") ?? String(idx);
    const totalTime = el.getAttribute("TotalTime");
    const bpmAttr = el.getAttribute("BPM");
    trackMap.set(id, {
      position: 0,
      title: el.getAttribute("Name") ?? "",
      artist: el.getAttribute("Artist") ?? "",
      bpm: bpmAttr ? parseFloat(bpmAttr) : null,
      key: el.getAttribute("Tonality") ?? null,
      duration_sec: totalTime ? parseInt(totalTime, 10) : null,
      genre: el.getAttribute("Genre") ?? null,
      comment: el.getAttribute("Comments") ?? null,
    });
  });

  const playlistTracks: SetlistTrack[] = [];
  const playlistNodes = doc.querySelectorAll("DJ_PLAYLISTS > PLAYLISTS NODE[Type='1']");
  playlistNodes.forEach((node) => {
    node.querySelectorAll("TRACK").forEach((el) => {
      const key = el.getAttribute("Key");
      if (key && trackMap.has(key)) {
        playlistTracks.push({ ...trackMap.get(key)! });
      }
    });
  });

  const ordered = playlistTracks.length > 0
    ? playlistTracks
    : Array.from(trackMap.values());

  const tracks = ordered.map((t, i) => ({ ...t, position: i + 1 }));
  return { tracks, source_format: "rekordbox_xml", source_filename: filename };
}

// ─── Traktor NML ──────────────────────────────────────────────────────────────

const TRAKTOR_KEY_MAP: Record<number, string> = {
  0: "1d", 1: "8b", 2: "3d", 3: "10b", 4: "5d", 5: "12b", 6: "7d", 7: "2b",
  8: "9d", 9: "4b", 10: "11d", 11: "6b", 12: "1b", 13: "8d", 14: "3b", 15: "10d",
  16: "5b", 17: "12d", 18: "7b", 19: "2d", 20: "9b", 21: "4d", 22: "11b", 23: "6d",
};

function parseTraktorNml(content: string, filename: string): ParsedSetlist {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");

  const entryMap = new Map<string, SetlistTrack>();
  const collectionEntries = doc.querySelectorAll("NML > COLLECTION > ENTRY");
  collectionEntries.forEach((el) => {
    const location = el.querySelector("LOCATION");
    const filePath = location?.getAttribute("FILE") ?? "";
    const tempoEl = el.querySelector("TEMPO");
    const keyEl = el.querySelector("MUSICAL_KEY");
    const infoEl = el.querySelector("INFO");
    const bpmAttr = tempoEl?.getAttribute("BPM");
    const keyVal = keyEl?.getAttribute("VALUE");
    const playtime = infoEl?.getAttribute("PLAYTIME");
    const keyNum = keyVal !== null && keyVal !== undefined ? parseInt(keyVal, 10) : NaN;
    const keyStr = !isNaN(keyNum) ? (TRAKTOR_KEY_MAP[keyNum] ?? null) : null;
    entryMap.set(filePath, {
      position: 0,
      title: el.getAttribute("TITLE") ?? "",
      artist: el.getAttribute("ARTIST") ?? "",
      bpm: bpmAttr ? parseFloat(bpmAttr) : null,
      key: keyStr,
      duration_sec: playtime ? parseInt(playtime, 10) : null,
      genre: infoEl?.getAttribute("GENRE") ?? null,
      comment: infoEl?.getAttribute("COMMENT") ?? null,
    });
  });

  const historyNode = Array.from(
    doc.querySelectorAll("NML > PLAYLISTS NODE[TYPE='PLAYLIST']")
  ).find((n) => n.getAttribute("NAME") === "History");

  let ordered: SetlistTrack[];
  if (historyNode) {
    const playlistTracks: SetlistTrack[] = [];
    historyNode.querySelectorAll("ENTRY PRIMARYKEY").forEach((pk) => {
      const key = pk.getAttribute("KEY") ?? "";
      const fileKey = key.split("/").pop() ?? key;
      const match = entryMap.get(fileKey) ?? entryMap.get(key);
      if (match) playlistTracks.push({ ...match });
    });
    ordered = playlistTracks.length > 0 ? playlistTracks : Array.from(entryMap.values());
  } else {
    ordered = Array.from(entryMap.values());
  }

  const tracks = ordered.map((t, i) => ({ ...t, position: i + 1 }));
  return { tracks, source_format: "traktor_nml", source_filename: filename };
}

// ─── M3U ─────────────────────────────────────────────────────────────────────

function parseM3u(content: string, filename: string): ParsedSetlist {
  const lines = content.split(/\r?\n/);
  const tracks: SetlistTrack[] = [];
  let position = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;
    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;
    const durationStr = line.slice("#EXTINF:".length, commaIdx).trim();
    const titlePart = line.slice(commaIdx + 1).trim();
    const duration = parseInt(durationStr, 10);
    const dashIdx = titlePart.indexOf(" - ");
    const artist = dashIdx !== -1 ? titlePart.slice(0, dashIdx).trim() : "";
    const title = dashIdx !== -1 ? titlePart.slice(dashIdx + 3).trim() : titlePart;
    tracks.push({
      position: position++,
      title,
      artist,
      bpm: null,
      key: null,
      duration_sec: !isNaN(duration) && duration > 0 ? duration : null,
      genre: null,
      comment: null,
    });
  }

  return { tracks, source_format: "m3u", source_filename: filename };
}

// ─── Serato Session ───────────────────────────────────────────────────────────

function parseSeratoSession(content: string, filename: string): ParsedSetlist {
  const bytes = Uint8Array.from(content.split("").map((c) => c.charCodeAt(0)));
  const decoder = new TextDecoder("utf-16be");
  const decoded = decoder.decode(bytes);
  const strings = decoded
    .split("\x00")
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && /^[\x20-\x7EÀ-ɏ]+$/.test(s) && s.length < 200);

  const tracks: SetlistTrack[] = [];
  let position = 1;
  for (let i = 0; i + 1 < strings.length; i += 2) {
    const title = strings[i].trim();
    const artist = strings[i + 1].trim();
    if (title && artist && title.length < 200 && artist.length < 100) {
      tracks.push({
        position: position++,
        title,
        artist,
        bpm: null,
        key: null,
        duration_sec: null,
        genre: null,
        comment: null,
      });
    }
  }

  return { tracks, source_format: "serato_session", source_filename: filename };
}

// ─── Detect & Parse ───────────────────────────────────────────────────────────

export function detectAndParse(filename: string, content: string): ParsedSetlist {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".nml")) return parseTraktorNml(content, filename);
  if (lower.endsWith(".m3u") || lower.endsWith(".m3u8")) return parseM3u(content, filename);
  if (lower.endsWith(".session")) return parseSeratoSession(content, filename);
  if (lower.endsWith(".xml")) {
    if (content.includes("<DJ_PLAYLISTS")) return parseRekordboxXml(content, filename);
    throw new Error("XML não reconhecido");
  }
  throw new Error("Formato não suportado");
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

type GigSetlistRow = {
  id: number;
  gig_id: number;
  source_format: string;
  source_filename: string | null;
  tracks: string;
  imported_at: string;
};

export async function getSetlistsForGig(gigId: number): Promise<GigSetlist[]> {
  const db = getDb();
  const rows = await db.select<GigSetlistRow[]>(
    "SELECT * FROM gig_setlists WHERE gig_id = $1 ORDER BY imported_at DESC",
    [gigId]
  );
  return rows.map((r) => ({
    ...r,
    tracks: JSON.parse(r.tracks) as SetlistTrack[],
  }));
}

export async function saveSetlist(gigId: number, parsed: ParsedSetlist): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    "INSERT INTO gig_setlists (gig_id, source_format, source_filename, tracks) VALUES ($1, $2, $3, $4)",
    [gigId, parsed.source_format, parsed.source_filename, JSON.stringify(parsed.tracks)]
  );
  return result.lastInsertId ?? 0;
}

export async function deleteSetlist(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM gig_setlists WHERE id = $1", [id]);
}
