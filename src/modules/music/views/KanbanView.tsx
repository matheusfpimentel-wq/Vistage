import { cn } from "@/lib/utils";
import { STAGES, STAGE_COLOR, TRACK_KIND_LABEL } from "../stages";
import { daysInStage } from "../api";
import type { TrackWithProject } from "../types";
import { trackDisplayName } from "../types";

export function KanbanView({
  tracks,
  onEdit,
}: {
  tracks: TrackWithProject[];
  onEdit: (t: TrackWithProject) => void;
}) {
  const active = tracks.filter((t) => !t.standby);
  const standby = tracks.filter((t) => t.standby);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STAGES.map((stage) => {
        const items = active.filter((t) => t.current_stage === stage);
        return (
          <div key={stage} className="w-60 shrink-0">
            <div
              className={cn(
                "mb-2 flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium",
                STAGE_COLOR[stage]
              )}
            >
              <span>{stage}</span>
              <span className="tabular-nums opacity-70">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <TrackCard key={t.id} track={t} onEdit={onEdit} />
              ))}
            </div>
          </div>
        );
      })}

      {standby.length > 0 && (
        <div className="w-60 shrink-0">
          <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            <span>Stand-by</span>
            <span className="tabular-nums opacity-70">{standby.length}</span>
          </div>
          <div className="space-y-2">
            {standby.map((t) => (
              <TrackCard key={t.id} track={t} onEdit={onEdit} dim />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackCard({
  track,
  onEdit,
  dim,
}: {
  track: TrackWithProject;
  onEdit: (t: TrackWithProject) => void;
  dim?: boolean;
}) {
  const days = daysInStage(track);
  const stalled = !track.standby && days !== null && days > 30;
  return (
    <button
      type="button"
      onClick={() => onEdit(track)}
      className={cn(
        "w-full space-y-1 rounded-md border bg-card p-2.5 text-left transition hover:border-primary",
        dim && "opacity-60"
      )}
    >
      <div className="font-medium text-sm leading-tight">
        {trackDisplayName(track)}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{TRACK_KIND_LABEL[track.kind]}</span>
        {days !== null && (
          <span className={cn("tabular-nums", stalled && "text-amber-500")}>
            {days}d no stage
          </span>
        )}
      </div>
    </button>
  );
}
