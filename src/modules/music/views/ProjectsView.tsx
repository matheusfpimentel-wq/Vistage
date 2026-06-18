import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { deleteProject } from "../api";
import { StageBadge } from "../components/StageBadge";
import type { MusicProject, TrackWithProject } from "../types";

type Props = {
  projects: MusicProject[];
  tracks: TrackWithProject[];
  onEditProject: (p: MusicProject) => void;
  onEditTrack: (t: TrackWithProject) => void;
  onNewTrack: (projectId: number) => void;
  onRefresh: () => void;
};

export function ProjectsView({
  projects,
  tracks,
  onEditProject,
  onEditTrack,
  onNewTrack,
  onRefresh,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteProject(p: MusicProject, trackCount: number) {
    const msg =
      trackCount > 0
        ? `Excluir o projeto "${p.title}" e suas ${trackCount} track(s)?`
        : `Excluir o projeto "${p.title}"?`;
    if (!(await confirmDialog({ title: "Excluir projeto", description: msg, confirmLabel: "Excluir", destructive: true })))
      return;
    try {
      await deleteProject(p.id);
      toast.success("Projeto excluído");
      onRefresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  const tracksByProject = (projectId: number) =>
    tracks.filter((t) => t.project_id === projectId);

  if (projects.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum projeto ainda. Clica em "Novo projeto".
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((p) => {
        const ptracks = tracksByProject(p.id);
        const isOpen = expanded.has(p.id);
        const active = ptracks.filter((t) => !t.standby).length;

        return (
          <div key={p.id} className="rounded-lg border">
            {/* header */}
            <div
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
              onClick={() => toggle(p.id)}
            >
              <span className="text-muted-foreground">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </span>
              <span className="flex-1 font-medium">{p.title}</span>
              {p.concept && (
                <span className="hidden max-w-xs truncate text-xs text-muted-foreground sm:block">
                  {p.concept}
                </span>
              )}
              <Badge variant="secondary" className="shrink-0">
                {ptracks.length} {ptracks.length === 1 ? "track" : "tracks"}
                {active < ptracks.length && ` · ${ptracks.length - active} stand-by`}
              </Badge>
              <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Editar projeto"
                  title="Editar projeto"
                  onClick={() => onEditProject(p)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Excluir projeto"
                  title="Excluir projeto"
                  onClick={() => void handleDeleteProject(p, ptracks.length)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* expanded track list */}
            {isOpen && (
              <div className="border-t px-4 py-3 space-y-2">
                {p.concept && (
                  <p className="text-xs text-muted-foreground italic mb-3">
                    {p.concept}
                  </p>
                )}

                {ptracks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma track neste projeto.</p>
                ) : (
                  <div className="space-y-1">
                    {ptracks.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent/50 transition-colors",
                          t.standby && "opacity-50"
                        )}
                        onClick={() => onEditTrack(t)}
                      >
                        <span className="flex-1 font-medium">
                          {t.title_final ?? t.title_working}
                          {t.standby && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(stand-by)</span>
                          )}
                        </span>
                        <StageBadge stage={t.current_stage} />
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => onNewTrack(p.id)}
                >
                  <Plus className="h-3.5 w-3.5" /> Nova track neste projeto
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
