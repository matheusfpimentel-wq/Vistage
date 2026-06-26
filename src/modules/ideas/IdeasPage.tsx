import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lightbulb, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { IdeaForm } from "./forms/IdeaForm";
import { QuickCapture } from "./forms/QuickCapture";
import { IdeaList } from "./views/IdeaList";
import { IdeaKanban } from "./views/IdeaKanban";
import { IdeaBoard } from "./views/IdeaBoard";
import { InsightDie } from "./InsightDie";
import { deleteIdea, listIdeas, markIdeaAsConverted, updateIdea, type IdeaFilters } from "./api";
import { TrackForm } from "@/modules/music/forms/TrackForm";
import { GigForm } from "@/modules/gigs/forms/GigForm";
import {
  IDEA_CATEGORIES,
  IDEA_HEATS,
  IDEA_HEAT_MAX,
  IDEA_HEAT_NEUTRAL,
  IDEA_MATURATIONS,
  heatLabel,
  type Idea,
  type IdeaCategory,
  type IdeaHeat,
  type IdeaMaturation,
} from "./types";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";

type CategoryFilter = IdeaCategory | "Todas";
type MaturationFilter = IdeaMaturation | "Todas";
type HeatFilter = IdeaHeat | "all";

export function IdeasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Idea[]>([]);
  const [filters, setFilters] = useState<{
    category: CategoryFilter;
    maturation: MaturationFilter;
    heat: HeatFilter;
    search: string;
  }>({ category: "Todas", maturation: "Todas", heat: "all", search: "" });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [convertingIdea, setConvertingIdea] = useState<Idea | null>(null);
  const [trackFormOpen, setTrackFormOpen] = useState(false);
  const [gigFormOpen, setGigFormOpen] = useState(false);

  const queryFilters: IdeaFilters = useMemo(
    () => ({
      category: filters.category,
      maturation: filters.maturation,
      heat: filters.heat,
      search: filters.search,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const data = await listIdeas(queryFilters);
    setItems(data);
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Deep-link ?open=<id> (vindo dos alertas) — abre a ideia específica assim
  // que a lista carrega.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const idea = items.find((i) => i.id === Number(openId));
    if (idea) {
      setEditing(idea);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, items, setSearchParams]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openConvertToTrack(i: Idea) {
    setConvertingIdea(i);
    setTrackFormOpen(true);
  }

  function openConvertToForm(i: Idea, target: "gig" | "track") {
    setConvertingIdea(i);
    if (target === "gig") setGigFormOpen(true);
    else setTrackFormOpen(true);
  }

  function openEdit(i: Idea) {
    setEditing(i);
    setFormOpen(true);
  }

  async function handleDelete(i: Idea) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir "${i.title}"?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteIdea(i.id);
    toast.success("Ideia excluída");
    await refresh();
  }

  async function handleDeleteById(id: number) {
    const idea = items.find((i) => i.id === id);
    if (
      !(await confirmDialog({
        title: "Excluir",
        description: idea ? `Excluir "${idea.title}"?` : "Excluir esta ideia?",
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteIdea(id);
    toast.success("Ideia excluída");
    await refresh();
  }

  async function handleToggleHot(i: Idea) {
    // Marca/desmarca a ideia como quente (máx ↔ morna como padrão neutro).
    const next: IdeaHeat = i.heat === IDEA_HEAT_MAX ? IDEA_HEAT_NEUTRAL : IDEA_HEAT_MAX;
    await updateIdea({ id: i.id, heat: next });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <ModuleToolbar
        primaryAction={{ label: "Nova ideia", icon: Plus, onClick: openCreate }}
        secondaryActions={[{ label: "Captura rápida", icon: Zap, onClick: () => setQuickOpen(true) }]}
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Buscar título, corpo…",
        }}
        resultCount={items.length}
        resultLabel="ideias"
        filtersActiveCount={
          (filters.category !== "Todas" ? 1 : 0) +
          (filters.maturation !== "Todas" ? 1 : 0) +
          (filters.heat !== "all" ? 1 : 0)
        }
        filters={
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <Select
                value={filters.category}
                onValueChange={(v) => setFilters((f) => ({ ...f, category: v as CategoryFilter }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todas">Todas categorias</SelectItem>
                  {IDEA_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Maturação</label>
              <Select
                value={filters.maturation}
                onValueChange={(v) => setFilters((f) => ({ ...f, maturation: v as MaturationFilter }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todas">Todas maturações</SelectItem>
                  {IDEA_MATURATIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Calor</label>
              <Select
                value={filters.heat.toString()}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    heat: v === "all" ? "all" : (Number(v) as IdeaHeat),
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Calor: todos</SelectItem>
                  {[...IDEA_HEATS].reverse().map((h) => (
                    <SelectItem key={h} value={h.toString()}>
                      {heatLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {items.length === 0 && filters.search === "" ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-12 text-center">
          <Lightbulb className="h-9 w-9 text-muted-foreground/60" />
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova ideia
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="board">
          <div className="mb-3">
            <InsightDie />
          </div>
          <TabsList>
            <TabsTrigger value="board">Mural</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>

          <TabsContent value="board">
            <IdeaBoard items={items} onEdit={openEdit} onConvertToTrack={openConvertToTrack} onToggleHot={handleToggleHot} onDelete={(id) => void handleDeleteById(id)} onCreate={openCreate} />
          </TabsContent>

          <TabsContent value="kanban">
            <IdeaKanban items={items} onEdit={openEdit} onConvertToTrack={openConvertToTrack} onDelete={(id) => void handleDeleteById(id)} onRefresh={() => void refresh()} />
          </TabsContent>

          <TabsContent value="list">
            <IdeaList items={items} onEdit={openEdit} onDelete={handleDelete} onConvertToTrack={openConvertToTrack} />
          </TabsContent>
        </Tabs>
      )}

      <IdeaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        idea={editing}
        onSaved={() => void refresh()}
        onConverted={() => void refresh()}
        onConvertToEntity={openConvertToForm}
        onDelete={(id) => void handleDeleteById(id)}
      />

      <QuickCapture
        open={quickOpen}
        onOpenChange={(v) => {
          setQuickOpen(v);
          if (!v) void refresh();
        }}
      />

      <TrackForm
        open={trackFormOpen}
        onOpenChange={(v) => {
          setTrackFormOpen(v);
          if (!v) setConvertingIdea(null);
        }}
        track={null}
        onSaved={async (newId) => {
          if (convertingIdea) {
            await markIdeaAsConverted(convertingIdea.id, "track", newId ?? 0);
            toast.success("Ideia convertida em track");
          }
          void refresh();
          setConvertingIdea(null);
        }}
      />

      <GigForm
        open={gigFormOpen}
        onOpenChange={(v) => {
          setGigFormOpen(v);
          if (!v) setConvertingIdea(null);
        }}
        gig={null}
        onSaved={async (res) => {
          if (convertingIdea) {
            await markIdeaAsConverted(convertingIdea.id, "gig", res.id);
            toast.success("Ideia convertida em GIG");
          }
          void refresh();
          setConvertingIdea(null);
        }}
      />
    </div>
  );
}
