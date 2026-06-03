// Stage-Gate Process (Cooper, 1986) — pipeline de produção musical com
// gates decisórios objetivos entre os stages.

export const STAGES = [
  "Ideação",
  "Composição",
  "Produção",
  "Mix",
  "Master",
  "Pré-lançamento",
  "Lançamento",
  "Pós-lançamento",
] as const;

export type Stage = (typeof STAGES)[number];

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function prevStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i > 0 ? STAGES[i - 1] : null;
}

/** Cor (classe Tailwind) por stage — usada nos badges e colunas do kanban. */
export const STAGE_COLOR: Record<Stage, string> = {
  Ideação: "bg-slate-500/20 text-slate-500 dark:text-slate-300",
  Composição: "bg-violet-500/20 text-violet-300",
  Produção: "bg-primary/20 text-primary",
  Mix: "bg-sky-500/20 text-sky-300",
  Master: "bg-cyan-500/20 text-cyan-300",
  "Pré-lançamento": "bg-amber-500/20 text-amber-400",
  Lançamento: "bg-emerald-500/20 text-emerald-400",
  "Pós-lançamento": "bg-rose-500/20 text-rose-300",
};

export const TRACK_KINDS = [
  "single",
  "album_track",
  "remix",
  "beat",
  "edit",
  "bootleg",
] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

export const TRACK_KIND_LABEL: Record<TrackKind, string> = {
  single: "Single",
  album_track: "Faixa de álbum",
  remix: "Remix",
  beat: "Beat",
  edit: "Edit",
  bootleg: "Bootleg",
};

export const PROJECT_KINDS = [
  "single",
  "ep",
  "album",
  "remix",
  "beat",
  "edit",
  "bootleg",
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  single: "Single",
  ep: "EP",
  album: "Álbum",
  remix: "Remix",
  beat: "Beat",
  edit: "Edit",
  bootleg: "Bootleg",
};

/** Quando uma track é criada solta, o projeto auto-gerado herda esse kind. */
export function projectKindFromTrack(kind: TrackKind): ProjectKind {
  return kind === "album_track" ? "album" : (kind as ProjectKind);
}
