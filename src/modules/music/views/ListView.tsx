import { useMemo, type ReactNode } from "react";
import { EMPTY_VALUE } from "@/lib/format";
import { Pencil, PlusSquare, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TRACK_KIND_LABEL } from "../stages";
import { daysInStage } from "../api";
import { StageBadge } from "../components/StageBadge";
import { trackDisplayName, type TrackWithProject } from "../types";
import { PendingTasksBadge } from "@/modules/tasks/components/PendingTasksBadge";
import { PendingTasksProvider } from "@/modules/tasks/components/PendingTasksContext";
import { useTableSort } from "@/lib/useTableSort";
import { ColResizer, useResizableColumns } from "@/lib/resizableColumns";
import { OrderableHeader, SortableTh, SortLabel, useOrderableColumns } from "@/lib/orderableColumns";
import type { ListDensity } from "@/components/shared/ListDensityToggle";

const RELEASED_STAGES = ["Lançamento", "Pós-lançamento"] as const;

/**
 * Linha da tabela = track + campos derivados só para ordenar colunas que não
 * mapeiam direto num campo (título de exibição, tempo no stage).
 */
type MusicRow = TrackWithProject & {
  _track: string;
  _days: number | null;
};

// Cabeçalho e corpo dirigidos pela mesma ORDEM: "track" (título do projeto,
// principal) e "actions" travadas; as colunas do meio reordenam ao arrastar.
type MusicCol = {
  id: string;
  locked?: boolean;
  sortKey?: keyof MusicRow;
  header: string;
  thClassName: string;
  /** classes do <td> — função pra permitir realce por linha (ex.: stalled). */
  tdClassName: (t: TrackWithProject) => string;
  resizable?: boolean;
  cell: (t: TrackWithProject, onEdit: (t: TrackWithProject) => void, navigate: ReturnType<typeof useNavigate>) => ReactNode;
};

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
  const rows: MusicRow[] = useMemo(
    () =>
      tracks.map((t) => ({
        ...t,
        _track: trackDisplayName(t),
        _days: daysInStage(t),
      })),
    [tracks]
  );
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(rows);
  const cols = useResizableColumns("music", [
    { id: "track", width: 220, min: 140 },
    { id: "project", width: 180, min: 100 },
    { id: "kind", width: 120, min: 80 },
    { id: "stage", width: 190, min: 120 },
    { id: "days", width: 130, min: 90 },
    { id: "actions", width: 110, min: 90 },
  ]);
  const compact = density === "compact";

  const colDefs: Record<string, MusicCol> = {
    track: {
      id: "track",
      locked: true,
      sortKey: "_track",
      header: "Track",
      thClassName: "px-3 py-2 text-left",
      tdClassName: () => "px-3 py-2",
      resizable: true,
      cell: (t, edit) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            edit(t);
          }}
          className="block max-w-full truncate text-left font-medium hover:text-primary"
        >
          {trackDisplayName(t)}
        </button>
      ),
    },
    project: {
      id: "project",
      sortKey: "project_title",
      header: "Projeto",
      thClassName: "px-3 py-2 text-left",
      tdClassName: () => "truncate px-3 py-2 text-muted-foreground",
      resizable: true,
      cell: (t) => t.project_title,
    },
    kind: {
      id: "kind",
      sortKey: "kind",
      header: "Tipo",
      thClassName: "px-3 py-2 text-left",
      tdClassName: () => "px-3 py-2 text-muted-foreground",
      resizable: true,
      cell: (t) => TRACK_KIND_LABEL[t.kind],
    },
    stage: {
      id: "stage",
      sortKey: "current_stage",
      header: "Stage",
      thClassName: "px-3 py-2 text-left",
      tdClassName: () => "px-3 py-2",
      resizable: true,
      cell: (t) => (
        <div className="flex items-center gap-1.5">
          <StageBadge stage={t.current_stage} standby={t.standby} />
          <PendingTasksBadge entityType="track" entityId={t.id} />
        </div>
      ),
    },
    days: {
      id: "days",
      sortKey: "_days",
      header: "Tempo no stage",
      thClassName: "px-3 py-2 text-right",
      tdClassName: (t) => {
        const days = daysInStage(t);
        const stalled = !t.standby && days !== null && days > 30;
        return cn("px-3 py-2 text-right tabular-nums", stalled ? "text-amber-500" : "text-muted-foreground");
      },
      resizable: true,
      cell: (t) => {
        const days = daysInStage(t);
        return days !== null ? `${days}d` : EMPTY_VALUE;
      },
    },
    actions: {
      id: "actions",
      locked: true,
      header: "",
      thClassName: "px-3 py-2",
      tdClassName: () => "px-3 py-2",
      cell: (t, edit, nav) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {(RELEASED_STAGES as readonly string[]).includes(t.current_stage) && (
            <button
              type="button"
              onClick={() => nav(`/conteudo?title=${encodeURIComponent(trackDisplayName(t))}`)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Criar conteúdo"
              title="Criar conteúdo"
            >
              <PlusSquare className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => edit(t)}
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
      ),
    },
  };

  const oc = useOrderableColumns(
    "music",
    cols.defs.map((c) => ({ id: c.id, locked: colDefs[c.id].locked }))
  );
  const tableWidth = oc.order.reduce((s, id) => s + cols.widths[id], 0);

  return (
    <PendingTasksProvider entityType="track">
    <div className="overflow-x-auto rounded-md border">
      <table
        className={cn("table-fixed", compact ? "text-xs [&_td]:py-1 [&_th]:py-1" : "text-sm")}
        style={{ width: tableWidth }}
      >
        <colgroup>
          {oc.order.map((id) => (
            <col key={id} style={cols.colStyle(id)} />
          ))}
        </colgroup>
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <OrderableHeader oc={oc}>
            <tr>
              {oc.order.map((id) => {
                const c = colDefs[id];
                const active = !!c.sortKey && sortKey === c.sortKey;
                return (
                  <SortableTh
                    key={id}
                    id={id}
                    locked={c.locked}
                    className={cn(c.thClassName, c.sortKey && "cursor-pointer")}
                    onClick={c.sortKey ? () => handleSort(c.sortKey!) : undefined}
                    title={c.locked ? undefined : "Clique pra ordenar · arraste pra reposicionar"}
                  >
                    {c.sortKey ? (
                      <SortLabel label={c.header} active={active} dir={active ? sortDir : null} />
                    ) : (
                      c.header
                    )}
                    {c.resizable && <ColResizer {...cols.resizer(id)} />}
                  </SortableTh>
                );
              })}
            </tr>
          </OrderableHeader>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={t.id}
              className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
              onClick={() => onEdit(t)}
              title="Clique pra editar"
            >
              {oc.order.map((id) => {
                const c = colDefs[id];
                return (
                  <td key={id} className={c.tdClassName(t)}>
                    {c.cell(t, onEdit, navigate)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </PendingTasksProvider>
  );
}
