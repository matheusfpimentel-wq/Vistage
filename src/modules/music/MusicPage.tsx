import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen, FolderPlus, Music, Plus, Search } from "lucide-react";
import type { MusicProject } from "./types";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
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
import { daysInStage, deleteTrack, getTrack, listProjects, listTracks, moveTrackToStage, setTrackStandby } from "./api";
import type { Track, TrackWithProject } from "./types";
import { TrackForm } from "./forms/TrackForm";
import { ProjectForm } from "./forms/ProjectForm";
import { KanbanView } from "./views/KanbanView";
import { ListView } from "./views/ListView";
import { RoadmapView } from "./views/RoadmapView";
import { PortfolioView } from "./views/PortfolioView";
import { ProjectsView } from "./views/ProjectsView";

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
    const [t, p] = await Promise.all([listTracks(), listProjects()]);
    setTracks(t);
    setProjects(p);
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

  const activeCount = tracks.filter((t) => !t.standby).length;
  const standbyCount = tracks.filter((t) => t.standby).length;
  const stalledCount = tracks.filter((t) => {
    if (t.standby) return false;
    const d = daysInStage(t);
    return d !== null && d > 30;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Produção Musical
          </h2>
          <p className="text-sm text-muted-foreground">
            Tracks no processo Stage-Gate, da ideação ao pós-lançamento.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setProjectFormOpen(true)}>
            <FolderPlus className="h-4 w-4" /> Novo projeto
          </Button>
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> Nova track
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Tracks ativas" value={activeCount} />
        <Kpi label="Em Stand-by" value={standbyCount} />
        <Kpi
          label="Paradas +30d no stage"
          value={stalledCount}
          warn={stalledCount > 0}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar track, projeto, gênero…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Select
          value={stageFilter}
          onValueChange={(v) => setStageFilter(v as StageFilter)}
        >
          <SelectTrigger className="w-44">
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
        <Select
          value={kindFilter}
          onValueChange={(v) => setKindFilter(v as KindFilter)}
        >
          <SelectTrigger className="w-40">
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

      <Tabs defaultValue="list">
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

        <TabsContent value="projetos">
          {projects.length === 0 && tracks.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              <Music className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Nenhuma track ainda. Clica em "Nova track" — o projeto é criado
              automaticamente.
            </div>
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

function Kpi({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 text-2xl font-semibold tabular-nums" +
          (warn ? " text-amber-500" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
