import type { Stage } from "./stages";
import type { TrackKind, ProjectKind } from "./stages";
import type { GateDecisionRecord } from "./gates";

export type ReleaseStrategy = "waterfall" | "drop_unico" | "album_direto" | "surprise_drop" | "ep_focus_track" | "singles_sequenciais" | "split_release" | "edits_bootlegs" | "sped_up" | "direct_to_fan" | "live_set_id" | "dj_pool_promo" | "double_single" | "remix_pack" | "deluxe_edition" | "visual_album" | "gated_release";

export type MusicProject = {
  id: number;
  kind: ProjectKind;
  title: string;
  release_strategy: ReleaseStrategy | null;
  presave_link: string | null;
  press_release_draft: string | null;
  marketing_dates: string | null; // JSON
  partnerships_confirmed: string | null;
  concept: string | null; // conceito do projeto
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MusicProjectCreateInput = Omit<
  MusicProject,
  "id" | "created_at" | "updated_at"
>;
export type MusicProjectUpdateInput = Partial<MusicProjectCreateInput> & {
  id: number;
};

export type StageHistoryEntry = {
  stage: Stage;
  entered_at: string;
  exited_at?: string | null;
  gate?: GateDecisionRecord | null;
};

/** Linha da tabela `tracks`. Campos JSON ficam serializados como string. */
export type TrackRow = {
  id: number;
  project_id: number;
  kind: TrackKind;
  title_working: string;
  title_final: string | null;
  bpm: number | null;
  key: string | null;
  duration_seconds: number | null;
  mood_tags: string | null;
  genre_primary: string | null;
  genre_secondary: string | null;
  reference_files: string | null;
  constraints: string | null;
  concept_narrative: string | null;
  current_stage: Stage;
  stage_history: string | null;
  daw_project_path: string | null;
  stems_path: string | null;
  final_files_path: string | null;
  stage_notes: string | null;
  creative_block_notes: string | null;
  standby: number;
  standby_until: string | null;
  task_id: number | null;
  related_track_id: number | null;
  created_at: string;
  updated_at: string;
};

/** Track desserializada (JSON já parseado). */
export type Track = Omit<
  TrackRow,
  "mood_tags" | "reference_files" | "stage_history" | "standby"
> & {
  mood_tags: string[];
  references: string[];
  stage_history: StageHistoryEntry[];
  standby: boolean;
  standby_until: string | null;
};

export type TrackCreateInput = {
  project_id: number | null; // null → auto-cria projeto
  kind: TrackKind;
  title_working: string;
  title_final: string | null;
  bpm: number | null;
  key: string | null;
  duration_seconds: number | null;
  mood_tags: string[];
  genre_primary: string | null;
  genre_secondary: string | null;
  references: string[];
  constraints: string | null;
  concept_narrative: string | null;
  daw_project_path: string | null;
  stems_path: string | null;
  final_files_path: string | null;
  stage_notes: string | null;
  creative_block_notes: string | null;
  related_track_id?: number | null;
};

export type TrackUpdateInput = Partial<TrackCreateInput> & { id: number; standby_until?: string | null };

/** Track com dados do projeto agregados (pro dashboard e listas). */
export type TrackWithProject = Track & {
  project_kind: ProjectKind;
  project_title: string;
};

export type FlowSession = {
  id: number;
  track_id: number;
  started_at: string;
  ended_at: string | null;
  flow_level: number | null;
  block_notes: string | null;
};

export type MusicProjectCost = {
  id: number;
  project_id: number | null;
  track_id: number | null;
  category: string | null;
  description: string | null;
  amount: number;
  date: string | null;
  created_at: string;
};

export type MusicProjectCostCreateInput = Omit<MusicProjectCost, "id" | "created_at">;

export type TrackPerformanceSnapshot = {
  id: number;
  track_id: number;
  period_yyyymm: string;
  data: string | null;
  created_at: string;
};

export type SnapshotData = {
  streams?: number;
  saves?: number;
  shares?: number;
  playlist_adds?: number;
  revenue_cents?: number;
  notes?: string;
};

export function trackDisplayName(t: {
  title_final: string | null;
  title_working: string;
}): string {
  return (t.title_final && t.title_final.trim()) || t.title_working;
}
