import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, FolderPlus, Music, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import type { MusicProject } from "./types";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { STAGES, TRACK_KINDS, TRACK_KIND_LABEL, type Stage, type TrackKind } from "./stages";
import { deleteTrack, getTrack, listProjects, listTracks, moveTrackToStage, setTrackStandby } from "./api";
import type { Track, TrackWithProject } from "./types";
import { TrackForm } from "./forms/TrackForm";
import { ProjectForm } from "./forms/ProjectForm";
import { KanbanView } from "./views/KanbanView";
import { ListView } from "./views/ListView";
import { RoadmapView } from "./views/RoadmapView";
import { PortfolioView } from "./views/PortfolioView";
import { ProjectsView } from "./views/ProjectsView";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { useModuleView } from "@/lib/moduleView";
import { ListDensityToggle, useListDensity } from "@/components/shared/ListDensityToggle";

type StageFilter = Stage | "Todos";
type KindFilter = TrackKind | "Todos";

export function MusicPage() {
  const [tracks, setTracks] = useState<TrackWithProject[]>([]);
  const [projects, setProjects] = useState<MusicProject[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("Todos");
  const [kindFilter, setKindFilter] = useState<KindFilter>("Todos");

  const [trackFormOpen, setTrackFormOpen] = useState(false);
  const [editing, setEditing] = useState<Track | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<number | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<MusicProject | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([listTracks(), listProjects()]);
      setTracks(t);
      setProjects(p);
    } catch (e) {
      toast.error(`Erro ao carregar músicas: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate(projectId?: number) {
    setEditing(null);
    setDefaultProjectId(projectId ?? null);
    setTrackFormOpen(true);
  }
  useNewItemShortcut(() => openCreate());

  async function openEdit(t: TrackWithProject) {
    const full = await getTrack(t.id);
    setEditing(full);
    setTrackFormOpen(true);
  }

  async function handleMoveStage(t: TrackWithProject, stage: import("./stages").Stage) {
    const full = await getTrack(t.id);
    if (full) await moveTrackToStage(full, stage);
    await refresh();
  }

  async function handleStandby(t: TrackWithProject) {
    await setTrackStandby(t.id, true);
    await refresh();
  }

  async function handleDelete(t: TrackWithProject) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir a track "${t.title_working}"?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteTrack(t.id);
    toast.success("Track excluída");
    await refresh();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tracks.filter((t) => {
      if (stageFilter !== "Todos" && t.current_stage !== stageFilter) return false;
      if (kindFilter !== "Todos" && t.kind !== kindFilter) return false;
      if (q) {
        const hay = `${t.title_working} ${t.title_final ?? ""} ${t.project_title} ${t.genre_primary ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tracks, search, stageFilter, kindFilter]);

  const [view, setView] = useModuleView<
    "projetos" | "kanban" | "list" | "roadmap" | "portfolio"
  >("music", "list");
  const [density, setDensity] = useListDensity("music");

  return (
    <div className="space-y-4">
      <ModuleToolbar
        primaryAction={{ label: "Nova track", icon: Plus, onClick: () => openCreate() }}
        secondaryActions={[
          { label: "Novo projeto", icon: FolderPlus, onClick: () => setProjectFormOpen(true) },
        ]}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar track, projeto, gênero…",
        }}
        resultCount={filtered.length}
        resultLabel="tracks"
        filtersActiveCount={
          (stageFilter !== "Todos" ? 1 : 0) + (kindFilter !== "Todos" ? 1 : 0)
        }
        filters={
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Stage</label>
              <Select
                value={stageFilter}
                onValueChange={(v) => setStageFilter(v as StageFilter)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos os stages</SelectItem>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select
                value={kindFilter}
                onValueChange={(v) => setKindFilter(v as KindFilter)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos os tipos</SelectItem>
                  {TRACK_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {TRACK_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="projetos">
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              Projetos
            </TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          </TabsList>
          {view === "list" && (
            <ListDensityToggle value={density} onChange={setDensity} />
          )}
        </div>

        <TabsContent value="projetos">
          {projects.length === 0 && tracks.length === 0 ? (
            <EmptyState
              icon={Music}
              title="Nenhuma track ainda."
              action={
                <Button size="sm" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" /> Nova track
                </Button>
              }
            />
          ) : (
            <ProjectsView
              projects={projects}
              tracks={tracks}
              onEditProject={(p) => { setEditingProject(p); setProjectFormOpen(true); }}
              onEditTrack={openEdit}
              onNewTrack={(projectId) => openCreate(projectId)}
              onRefresh={() => void refresh()}
            />
          )}
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanView
            tracks={filtered}
            onEdit={openEdit}
            onMove={handleMoveStage}
            onStandby={handleStandby}
          />
        </TabsContent>
        <TabsContent value="list">
          <ListView
            tracks={filtered}
            onEdit={openEdit}
            onDelete={handleDelete}
            density={density}
          />
        </TabsContent>
        <TabsContent value="roadmap">
          <RoadmapView tracks={tracks} projects={projects} />
        </TabsContent>
        <TabsContent value="portfolio">
          <PortfolioView tracks={tracks} />
        </TabsContent>
      </Tabs>

      <TrackForm
        open={trackFormOpen}
        onOpenChange={setTrackFormOpen}
        track={editing}
        defaultProjectId={defaultProjectId}
        onSaved={() => void refresh()}
      />
      <ProjectForm
        open={projectFormOpen}
        onOpenChange={(v) => { setProjectFormOpen(v); if (!v) setEditingProject(null); }}
        project={editingProject}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

