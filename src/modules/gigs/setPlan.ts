import type { LibraryTrack } from "@/modules/biblioteca/library/api";

// Set Planner — modelo de dados + lógica pura (tempo, validação, export). Todo o
// planejamento vive num JSON em gigs.set_plan (salva no submit da GIG). Uma faixa
// pode vir da Biblioteca de Músicas (com áudio + duração) ou ser digitada à mão /
// vinda da pesquisa (sem áudio) — o que muda a validação do export.

export type CurationBucket = "inegociaveis" | "descobertas" | "proprias";

/** Faixa "solta" nas listas de Curadoria (aba 1). */
export type SetTrack = {
  id: string; // uid local (DnD / referências)
  library_track_id: number | null;
  title: string;
  artist: string;
  duration_sec: number | null;
  bpm: number | null;
  key: string | null;
  has_audio: boolean; // snapshot: arquivo de áudio vinculado E presente no disco
};

/** Item ordenado do Setlist (aba 2): faixa + bloco + transição pra próxima. */
export type SetItem = SetTrack & {
  block: string; // rótulo do bloco (agrupamento); "" = sem bloco
  transition: string; // nota da transição PARA a próxima faixa
  origin: CurationBucket | "manual";
};

export type SetPlan = {
  // Curadoria
  concept: string; // conceito/intenção do set
  role: string; // papel nesta gig
  goal: string; // objetivo
  inegociaveis: SetTrack[];
  descobertas: SetTrack[];
  proprias: SetTrack[];
  // Setlist (plano ordenado)
  setlist: SetItem[];
  avg_transition_min: number; // tempo médio de transição (só isto é configurável)
};

export const DEFAULT_TRANSITION_MIN = 1;

export function emptySetPlan(): SetPlan {
  return {
    concept: "",
    role: "",
    goal: "",
    inegociaveis: [],
    descobertas: [],
    proprias: [],
    setlist: [],
    avg_transition_min: DEFAULT_TRANSITION_MIN,
  };
}

/** uid curto e único o bastante para chaves de DnD (não é id de banco). */
export function uid(): string {
  return (
    "s" +
    Math.floor(Math.random() * 1e9).toString(36) +
    Math.floor(Math.random() * 1e6).toString(36)
  );
}

/** Uma faixa da Biblioteca de Músicas vira SetTrack (snapshot de metadados). */
export function trackFromLibrary(t: LibraryTrack): SetTrack {
  return {
    id: uid(),
    library_track_id: t.id,
    title: (t.title ?? "").trim() || "Sem título",
    artist: (t.artist ?? "").trim(),
    duration_sec: t.duration_sec,
    bpm: t.bpm,
    key: t.music_key,
    has_audio: !!t.file_path && t.file_missing === 0,
  };
}

/** Faixa digitada à mão / vinda da pesquisa (sem áudio vinculado). */
export function manualTrack(title: string, artist: string): SetTrack {
  return {
    id: uid(),
    library_track_id: null,
    title: title.trim() || "Sem título",
    artist: artist.trim(),
    duration_sec: null,
    bpm: null,
    key: null,
    has_audio: false,
  };
}

function toSetTrack(v: unknown): SetTrack | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title : "";
  if (!title && o.library_track_id == null) return null;
  return {
    id: typeof o.id === "string" ? o.id : uid(),
    library_track_id: typeof o.library_track_id === "number" ? o.library_track_id : null,
    title: title || "Sem título",
    artist: typeof o.artist === "string" ? o.artist : "",
    duration_sec: typeof o.duration_sec === "number" ? o.duration_sec : null,
    bpm: typeof o.bpm === "number" ? o.bpm : null,
    key: typeof o.key === "string" ? o.key : null,
    has_audio: o.has_audio === true,
  };
}

function toSetItem(v: unknown): SetItem | null {
  const base = toSetTrack(v);
  if (!base) return null;
  const o = v as Record<string, unknown>;
  const origin = o.origin;
  return {
    ...base,
    block: typeof o.block === "string" ? o.block : "",
    transition: typeof o.transition === "string" ? o.transition : "",
    origin:
      origin === "inegociaveis" || origin === "descobertas" || origin === "proprias"
        ? origin
        : "manual",
  };
}

/** Parse tolerante do JSON persistido (nunca lança). */
export function parseSetPlan(json: string | null | undefined): SetPlan {
  const plan = emptySetPlan();
  if (!json) return plan;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (typeof raw.concept === "string") plan.concept = raw.concept;
    if (typeof raw.role === "string") plan.role = raw.role;
    if (typeof raw.goal === "string") plan.goal = raw.goal;
    if (Array.isArray(raw.inegociaveis)) plan.inegociaveis = raw.inegociaveis.map(toSetTrack).filter(Boolean) as SetTrack[];
    if (Array.isArray(raw.descobertas)) plan.descobertas = raw.descobertas.map(toSetTrack).filter(Boolean) as SetTrack[];
    if (Array.isArray(raw.proprias)) plan.proprias = raw.proprias.map(toSetTrack).filter(Boolean) as SetTrack[];
    if (Array.isArray(raw.setlist)) plan.setlist = raw.setlist.map(toSetItem).filter(Boolean) as SetItem[];
    if (typeof raw.avg_transition_min === "number" && raw.avg_transition_min >= 0) {
      plan.avg_transition_min = raw.avg_transition_min;
    }
  } catch {
    /* JSON corrompido — devolve plano vazio */
  }
  return plan;
}

export function serializeSetPlan(plan: SetPlan): string | null {
  const empty =
    !plan.concept &&
    !plan.role &&
    !plan.goal &&
    plan.inegociaveis.length === 0 &&
    plan.descobertas.length === 0 &&
    plan.proprias.length === 0 &&
    plan.setlist.length === 0 &&
    plan.avg_transition_min === DEFAULT_TRANSITION_MIN;
  return empty ? null : JSON.stringify(plan);
}

// ── Tempo estimado do set ────────────────────────────────────────────────────
// Soma das durações das faixas MENOS o tempo sobreposto pelas transições. Numa
// mixagem contínua a próxima faixa entra antes da anterior acabar, então cada
// uma das (N-1) transições encurta o set em `avg_transition_min`.
export type SetTiming = {
  totalSec: number;
  sumSec: number;
  transitions: number;
  transitionSec: number;
  withDuration: number;
  missingDuration: number;
};

export function computeSetTiming(plan: SetPlan): SetTiming {
  const items = plan.setlist;
  const sumSec = items.reduce((a, i) => a + (i.duration_sec ?? 0), 0);
  const transitions = Math.max(0, items.length - 1);
  const transitionSec = transitions * Math.max(0, plan.avg_transition_min) * 60;
  const missingDuration = items.filter((i) => i.duration_sec == null).length;
  return {
    totalSec: Math.max(0, Math.round(sumSec - transitionSec)),
    sumSec: Math.round(sumSec),
    transitions,
    transitionSec: Math.round(transitionSec),
    withDuration: items.length - missingDuration,
    missingDuration,
  };
}

/** "1h 12min" (longo) ou "72 min". */
export function fmtSetDuration(sec: number): string {
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/** "3:45" a partir de segundos (para durações de faixa). */
export function fmtTrackDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Validação de export ──────────────────────────────────────────────────────
/** Faixas do setlist SEM arquivo de áudio vinculado — não vão aparecer na
 *  playlist do software de discotecagem. */
export function tracksWithoutAudio(plan: SetPlan): SetItem[] {
  return plan.setlist.filter((i) => !i.has_audio || i.library_track_id == null);
}

// ── Export M3U8 (Rekordbox e Serato importam) ────────────────────────────────
/** Playlist M3U8 apontando pros arquivos de áudio. Só entram faixas com áudio
 *  (as demais dispararam o aviso na validação). `pathFor` resolve o caminho do
 *  arquivo a partir do library_track_id (a duração vai no #EXTINF). */
export function buildM3U8(
  plan: SetPlan,
  pathFor: (libraryTrackId: number) => { path: string; duration: number | null } | null
): string {
  const lines = ["#EXTM3U"];
  for (const it of plan.setlist) {
    if (it.library_track_id == null) continue;
    const info = pathFor(it.library_track_id);
    if (!info || !info.path) continue;
    const dur = info.duration ?? it.duration_sec ?? -1;
    const label = [it.artist, it.title].filter(Boolean).join(" - ");
    lines.push(`#EXTINF:${Math.round(dur)},${label}`);
    lines.push(info.path);
  }
  return lines.join("\n") + "\n";
}
