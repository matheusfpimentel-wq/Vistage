import { cn } from "@/lib/utils";
import { STAGES, STAGE_COLOR, TRACK_KIND_LABEL } from "../stages";
import { daysInStage } from "../api";
import type { Stage } from "../stages";
import type { TrackWithProject } from "../types";
import { trackDisplayName } from "../types";
import { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/kanbanDnd";

const STANDBY_COL = "__standby__";

export function KanbanView({
  tracks,
  onEdit,
  onMove,
  onStandby,
}: {
  tracks: TrackWithProject[];
  onEdit: (t: TrackWithProject) => void;
  onMove?: (track: TrackWithProject, stage: Stage) => void;
  onStandby?: (track: TrackWithProject) => void;
}) {
  const active = tracks.filter((t) => !t.standby);
  const standby = tracks.filter((t) => t.standby);

  function handleMove(id: number, col: string) {
    const t = tracks.find((x) => x.id === id);
    if (!t) return;
    if (col === STANDBY_COL) {
      if (!t.standby) onStandby?.(t);
    } else {
      onMove?.(t, col as Stage);
    }
  }

  return (
    <KanbanBoard onMove={handleMove} className="flex gap-3 overflow-x-auto pb-2">
      {STAGES.map((stage) => {
        const items = active.filter((t) => t.current_stage === stage);
        return (
          <KanbanColumn key={stage} status={stage} className="w-60 shrink-0">
            <div
              className={cn(
                "mb-2 flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium",
                STAGE_COLOR[stage]
              )}
            >
              <span>{stage}</span>
              <span className="tabular-nums opacity-70">{items.length}</span>
            </div>
            <div className="min-h-[40px] space-y-2">
              {items.map((t) => (
                <TrackCard key={t.id} track={t} onEdit={onEdit} />
              ))}
            </div>
          </KanbanColumn>
        );
      })}

      <KanbanColumn status={STANDBY_COL} className="w-60 shrink-0">
        <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          <span>Stand-by</span>
          <span className="tabular-nums opacity-70">{standby.length}</span>
        </div>
        <div className="min-h-[40px] space-y-2">
          {standby.map((t) => (
            <TrackCard key={t.id} track={t} onEdit={onEdit} dim />
          ))}
        </div>
      </KanbanColumn>
    </KanbanBoard>
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
    <KanbanCard
      id={track.id}
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
    </KanbanCard>
  );
}
