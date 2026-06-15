import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRACK_KIND_LABEL } from "../stages";
import { daysInStage } from "../api";
import { StageBadge } from "../components/StageBadge";
import { trackDisplayName, type TrackWithProject } from "../types";

export function ListView({
  tracks,
  onEdit,
  onDelete,
}: {
  tracks: TrackWithProject[];
  onEdit: (t: TrackWithProject) => void;
  onDelete: (t: TrackWithProject) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Track</th>
            <th className="px-3 py-2 text-left">Projeto</th>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-right">Tempo no stage</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {tracks.map((t) => {
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
                    className="font-medium hover:text-primary"
                  >
                    {trackDisplayName(t)}
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {t.project_title}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {TRACK_KIND_LABEL[t.kind]}
                </td>
                <td className="px-3 py-2">
                  <StageBadge stage={t.current_stage} standby={t.standby} />
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
  );
}
