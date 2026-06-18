import { useCallback, useEffect, useMemo, useState } from "react";
import { Lightbulb, Plus, Search, Zap } from "lucide-react";
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
  IDEA_MATURATIONS,
  type Idea,
  type IdeaCategory,
  type IdeaHeat,
  type IdeaMaturation,
} from "./types";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { PageToolbar } from "@/components/shared/PageToolbar";

type CategoryFilter = IdeaCategory | "Todas";
type MaturationFilter = IdeaMaturation | "Todas";
type HeatFilter = IdeaHeat | "all";

export function IdeasPage() {
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

  async function handleToggleHot(i: Idea) {
    // Marca/desmarca a ideia como quente (calor 3 ↔ 2/morna como padrão neutro).
    const next: IdeaHeat = i.heat === 3 ? 2 : 3;
    await updateIdea({ id: i.id, heat: next });
    await refresh();
  }

  return (
    <div className="space-y-4">
      <PageToolbar
        actions={
          <>
            <Button variant="outline" onClick={() => setQuickOpen(true)}>
              <Zap className="h-4 w-4" /> Captura rápida
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nova ideia
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar título, corpo…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-72 pl-8"
            />
          </div>
          <Select
            value={filters.category}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, category: v as CategoryFilter }))
            }
          >
            <SelectTrigger className="w-44">
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
          <Select
            value={filters.maturation}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, maturation: v as MaturationFilter }))
            }
          >
            <SelectTrigger className="w-44">
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
          <Select
            value={filters.heat.toString()}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                heat: v === "all" ? "all" : (Number(v) as IdeaHeat),
              }))
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Calor: todos</SelectItem>
              <SelectItem value="3">Quente</SelectItem>
              <SelectItem value="2">Morna</SelectItem>
              <SelectItem value="1">Fria</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageToolbar>

      {items.length === 0 && filters.search === "" ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Lightbulb className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Solta uma ideia com{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">
            Ctrl/Cmd + I
          </kbd>{" "}
          em qualquer tela.
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
            <IdeaBoard items={items} onEdit={openEdit} onConvertToTrack={openConvertToTrack} onToggleHot={handleToggleHot} onDelete={async (id) => { await deleteIdea(id); toast.success("Ideia excluída"); await refresh(); }} />
          </TabsContent>

          <TabsContent value="kanban">
            <IdeaKanban items={items} onEdit={openEdit} onConvertToTrack={openConvertToTrack} onDelete={async (id) => { await deleteIdea(id); toast.success("Ideia excluída"); await refresh(); }} onRefresh={() => void refresh()} />
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
        onDelete={async (id) => { await deleteIdea(id); toast.success("Ideia excluída"); await refresh(); }}
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
