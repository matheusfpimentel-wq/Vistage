import type { LibraryTrack } from "@/modules/biblioteca/library/api";

// Set Planner — modelo de dados + lógica pura (tempo, validação, export). Todo o
// planejamento vive num JSON em gigs.set_plan (salva no submit da GIG). O Setlist
// é a fonte única das faixas: cada uma tem uma TAG (papel na pista) e pertence a
// um MOMENTO (agrupamento pensado pela pista: Warm-up, Pico, Grand Finale, bloco
// de gênero…). O parse migra planos antigos (bloco de texto → Momento; listas de
// curadoria separadas → faixas com a tag correspondente) sem perder nada.

/** Papel da faixa no set, sinalizado ao adicionar. */
export type TrackTag = "inegociavel" | "autoral" | "achado";

/** Faixa base (metadados). */
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

/** Momento do set (agrupamento). Warm-up, Construção, Pico, Grand Finale, ou um
 *  bloco de gênero ("Bloco Funk"). Cor opcional só decora o cabeçalho/chip. */
export type SetMoment = {
  id: string;
  name: string;
  color: string | null;
};

/** Item do Setlist: faixa + momento + tag + transição pra próxima. */
export type SetItem = SetTrack & {
  moment_id: string | null; // null = "Sem momento"
  tag: TrackTag;
  transition: string;
};

export type SetPlan = {
  concept: string; // conceito/intenção do set
  role: string; // papel nesta gig
  goal: string; // objetivo
  moments: SetMoment[]; // ordem dos momentos
  setlist: SetItem[]; // agrupado por momento (contíguo), na ordem de execução
  avg_transition_min: number; // tempo médio de transição (só isto é configurável)
};

export const DEFAULT_TRANSITION_MIN = 1;

/** Sugestões de momento comuns na jornada da pista. */
export const MOMENT_SUGGESTIONS = ["Warm-up", "Construção", "Pico", "Grand Finale", "Encore"];
const MOMENT_COLORS = ["#8b5cf6", "#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#f43f5e", "#06b6d4", "#f97316"];

export const TAG_LABEL: Record<TrackTag, string> = {
  inegociavel: "Inegociável",
  autoral: "Autoral",
  achado: "Achado",
};

export function emptySetPlan(): SetPlan {
  return {
    concept: "",
    role: "",
    goal: "",
    moments: [],
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

/** Novo momento com cor da paleta pela posição. */
export function newMoment(name: string, index: number): SetMoment {
  return { id: uid(), name: name.trim() || "Momento", color: MOMENT_COLORS[index % MOMENT_COLORS.length] };
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

/** Faixa digitada à mão (sem áudio vinculado). Duração/BPM/Key são opcionais. */
export function manualTrack(
  title: string,
  artist: string,
  extra?: Partial<Pick<SetTrack, "duration_sec" | "bpm" | "key">>
): SetTrack {
  return {
    id: uid(),
    library_track_id: null,
    title: title.trim() || "Sem título",
    artist: artist.trim(),
    duration_sec: extra?.duration_sec ?? null,
    bpm: extra?.bpm ?? null,
    key: extra?.key ?? null,
    has_audio: false,
  };
}

/** Parseia duração digitada: "3:45" → 225, "225" → 225, vazio/inválido → null. */
export function parseDurationInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const mmss = /^(\d+):([0-5]?\d)$/.exec(s);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Embrulha uma faixa em item de setlist com tag + momento. */
export function setItemFrom(track: SetTrack, tag: TrackTag, moment_id: string | null): SetItem {
  return { ...track, tag, moment_id, transition: "" };
}

/** Chave de deduplicação (mesma faixa não entra 2x). */
export function trackKey(t: Pick<SetTrack, "library_track_id" | "title" | "artist">): string {
  return t.library_track_id != null
    ? `l${t.library_track_id}`
    : `m${t.title.trim().toLowerCase()}|${t.artist.trim().toLowerCase()}`;
}

// ── Parse tolerante + migração do legado ────────────────────────────────────
function toSetTrackBase(o: Record<string, unknown>): SetTrack | null {
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

/** Aceita tag nova (inegociavel/autoral/achado) OU origin antiga
 *  (inegociaveis/proprias/descobertas/manual). */
function toTag(v: unknown): TrackTag {
  if (v === "inegociavel" || v === "inegociaveis") return "inegociavel";
  if (v === "autoral" || v === "proprias") return "autoral";
  return "achado"; // descobertas, manual, achado, desconhecido
}

/** Reagrupa o setlist: itens do mesmo momento ficam contíguos, na ordem dos
 *  momentos; "Sem momento" vai pro fim. Sort estável preserva a ordem interna. */
export function regroup(setlist: SetItem[], moments: SetMoment[]): SetItem[] {
  const order = new Map(moments.map((m, i) => [m.id, i]));
  return [...setlist].sort((a, b) => {
    const oa = a.moment_id != null ? order.get(a.moment_id) ?? 9998 : 9999;
    const ob = b.moment_id != null ? order.get(b.moment_id) ?? 9998 : 9999;
    return oa - ob;
  });
}

export function parseSetPlan(json: string | null | undefined): SetPlan {
  const plan = emptySetPlan();
  if (!json) return plan;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (typeof raw.concept === "string") plan.concept = raw.concept;
    if (typeof raw.role === "string") plan.role = raw.role;
    if (typeof raw.goal === "string") plan.goal = raw.goal;
    if (typeof raw.avg_transition_min === "number" && raw.avg_transition_min >= 0) {
      plan.avg_transition_min = raw.avg_transition_min;
    }

    // Momentos (formato novo).
    const moments: SetMoment[] = [];
    if (Array.isArray(raw.moments)) {
      for (const m of raw.moments) {
        if (m && typeof m === "object") {
          const mo = m as Record<string, unknown>;
          moments.push({
            id: typeof mo.id === "string" ? mo.id : uid(),
            name: typeof mo.name === "string" && mo.name.trim() ? mo.name : "Momento",
            color: typeof mo.color === "string" ? mo.color : null,
          });
        }
      }
    }

    // Setlist. Suporta tag/moment_id novos OU origin/block (texto) legados.
    const blockToMoment = new Map<string, string>();
    const seen = new Set<string>();
    const setlist: SetItem[] = [];
    if (Array.isArray(raw.setlist)) {
      for (const it of raw.setlist) {
        if (!it || typeof it !== "object") continue;
        const o = it as Record<string, unknown>;
        const base = toSetTrackBase(o);
        if (!base) continue;
        const tag = toTag(typeof o.tag === "string" ? o.tag : o.origin);
        let momentId: string | null = null;
        if (typeof o.moment_id === "string") {
          momentId = o.moment_id;
        } else if (typeof o.block === "string" && o.block.trim()) {
          // Migra bloco (texto por música) → Momento de verdade.
          const key = o.block.trim().toLowerCase();
          let mid = blockToMoment.get(key);
          if (!mid) {
            const m = newMoment(o.block.trim(), moments.length);
            moments.push(m);
            mid = m.id;
            blockToMoment.set(key, mid);
          }
          momentId = mid;
        }
        setlist.push({ ...base, tag, moment_id: momentId, transition: typeof o.transition === "string" ? o.transition : "" });
        seen.add(trackKey(base));
      }
    }

    // Curadoria legada (arrays separados) → entra no setlist se ainda não estiver.
    const absorb = (arr: unknown, tag: TrackTag) => {
      if (!Array.isArray(arr)) return;
      for (const v of arr) {
        if (!v || typeof v !== "object") continue;
        const base = toSetTrackBase(v as Record<string, unknown>);
        if (!base) continue;
        const k = trackKey(base);
        if (seen.has(k)) continue;
        seen.add(k);
        setlist.push({ ...base, tag, moment_id: null, transition: "" });
      }
    };
    absorb(raw.inegociaveis, "inegociavel");
    absorb(raw.proprias, "autoral");
    absorb(raw.descobertas, "achado");

    plan.moments = moments;
    plan.setlist = regroup(setlist, moments);
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
    plan.moments.length === 0 &&
    plan.setlist.length === 0 &&
    plan.avg_transition_min === DEFAULT_TRANSITION_MIN;
  return empty ? null : JSON.stringify(plan);
}

// ── Consultas de curadoria (views derivadas do setlist) ─────────────────────
export function tracksByTag(plan: SetPlan, tag: TrackTag): SetItem[] {
  return plan.setlist.filter((i) => i.tag === tag);
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

/** Subtotal de duração (soma bruta) de um momento — pra exibir no cabeçalho. */
export function momentSubtotalSec(plan: SetPlan, momentId: string | null): number {
  return plan.setlist
    .filter((i) => i.moment_id === momentId)
    .reduce((a, i) => a + (i.duration_sec ?? 0), 0);
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
