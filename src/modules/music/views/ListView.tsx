import { Pencil, PlusSquare, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TRACK_KIND_LABEL } from "../stages";
import { daysInStage } from "../api";
import { StageBadge } from "../components/StageBadge";
import { trackDisplayName, type TrackWithProject } from "../types";
import { PendingTasksBadge } from "@/modules/tasks/components/PendingTasksBadge";
import { PendingTasksProvider } from "@/modules/tasks/components/PendingTasksContext";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { ColResizer, useResizableColumns } from "@/lib/resizableColumns";
import type { ListDensity } from "@/components/shared/ListDensityToggle";

const RELEASED_STAGES = ["Lançamento", "Pós-lançamento"] as const;

export function ListView({
  tracks,
  onEdit,
  onDelete,
  density = "full",
}: {
  tracks: TrackWithProject[];
  onEdit: (t: TrackWithProject) => void;
  onDelete: (t: TrackWithProject) => void;
  density?: ListDensity;
}) {
  const navigate = useNavigate();
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(tracks);
  const cols = useResizableColumns("music", [
    { id: "track", width: 220, min: 140 },
    { id: "project", width: 180, min: 100 },
    { id: "kind", width: 120, min: 80 },
    { id: "stage", width: 190, min: 120 },
    { id: "days", width: 130, min: 90 },
    { id: "actions", width: 110, min: 90 },
  ]);
  const tableWidth = cols.defs.reduce((s, c) => s + cols.widths[c.id], 0);
  const compact = density === "compact";
  return (
    <PendingTasksProvider entityType="track">
    <div className="overflow-x-auto rounded-md border">
      <table
        className={cn("table-fixed", compact ? "text-xs [&_td]:py-1 [&_th]:py-1" : "text-sm")}
        style={{ width: tableWidth }}
      >
        <colgroup>
          {cols.defs.map((c) => (
            <col key={c.id} style={cols.colStyle(c.id)} />
          ))}
        </colgroup>
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="relative px-3 py-2 text-left">Track<ColResizer {...cols.resizer("track")} /></th>
            <SortableHeader<TrackWithProject> col="project_title" label="Projeto" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
              <ColResizer {...cols.resizer("project")} />
            </SortableHeader>
            <SortableHeader<TrackWithProject> col="kind" label="Tipo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
              <ColResizer {...cols.resizer("kind")} />
            </SortableHeader>
            <SortableHeader<TrackWithProject> col="current_stage" label="Stage" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
              <ColResizer {...cols.resizer("stage")} />
            </SortableHeader>
            <th className="relative px-3 py-2 text-right">Tempo no stage<ColResizer {...cols.resizer("days")} /></th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const days = daysInStage(t);
            const stalled = !t.standby && days !== null && days > 30;
            return (
              <tr
                key={t.id}
                className="border-b last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    className="block max-w-full truncate text-left font-medium hover:text-primary"
                  >
                    {trackDisplayName(t)}
                  </button>
                </td>
                <td className="truncate px-3 py-2 text-muted-foreground">
                  {t.project_title}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {TRACK_KIND_LABEL[t.kind]}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <StageBadge stage={t.current_stage} standby={t.standby} />
                    <PendingTasksBadge entityType="track" entityId={t.id} />
                  </div>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    stalled ? "text-amber-500" : "text-muted-foreground"
                  )}
                >
                  {days !== null ? `${days}d` : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {(RELEASED_STAGES as readonly string[]).includes(t.current_stage) && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/conteudo?title=${encodeURIComponent(trackDisplayName(t))}`
                          )
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Criar conteúdo"
                        title="Criar conteúdo"
                      >
                        <PlusSquare className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </PendingTasksProvider>
  );
}
