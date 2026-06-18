import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Film, Plus } from "lucide-react";
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
import { ContentForm } from "./forms/ContentForm";
import { ContentList } from "./views/ContentList";
import { ContentKanban } from "./views/ContentKanban";
import { ContentCalendar } from "./views/ContentCalendar";
import { deleteContent, listContent, updateContent, type ContentFilters } from "./api";
import { updateTask } from "@/modules/tasks/api";
import {
  CONTENT_FORMATS,
  CONTENT_NETWORKS,
  CONTENT_STATUSES,
  type Content,
  type ContentFormat,
  type ContentNetwork,
  type ContentStatus,
} from "./types";
import { loadIdentity } from "@/modules/identity/api";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { useModuleView } from "@/lib/moduleView";

type StatusFilter = ContentStatus | "Todos";
type FormatFilter = ContentFormat | "Todos";
type NetworkFilter = ContentNetwork | "Todas";

export function ContentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Content[]>([]);
  const [filters, setFilters] = useState<{
    status: StatusFilter;
    format: FormatFilter;
    network: NetworkFilter;
    search: string;
  }>({ status: "Todos", format: "Todos", network: "Todas", search: "" });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Content | null>(null);
  const [formDefaults, setFormDefaults] = useState<{ title?: string; track_id?: number | null } | null>(null);
  const [networkOptions, setNetworkOptions] = useState<string[]>([
    ...CONTENT_NETWORKS,
  ]);

  const queryFilters: ContentFilters = useMemo(
    () => ({
      status: filters.status,
      format: filters.format,
      network: filters.network,
      search: filters.search,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const data = await listContent(queryFilters);
    setItems(data);
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pre-fill form when navigated with ?title=...
  useEffect(() => {
    const prefillTitle = searchParams.get("title");
    const prefillTrackId = searchParams.get("track_id");
    if (prefillTitle || prefillTrackId) {
      const defaults: { title?: string; track_id?: number | null } = {};
      if (prefillTitle) defaults.title = prefillTitle;
      if (prefillTrackId && !Number.isNaN(Number(prefillTrackId)))
        defaults.track_id = Number(prefillTrackId);
      setFormDefaults(defaults);
      setEditing(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, []);

  useEffect(() => {
    void loadIdentity().then((identity) => {
      const fromIdentity = Array.from(
        new Set(identity.socials.map((s) => s.network).filter(Boolean))
      );
      if (fromIdentity.length > 0) setNetworkOptions(fromIdentity);
    });
  }, []);

  function openCreate() {
    setEditing(null);
    setFormDefaults(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(c: Content) {
    setEditing(c);
    setFormOpen(true);
  }

  async function handleMove(id: number, status: ContentStatus) {
    await updateContent({ id, status });
    // Quando publica, conclui a tarefa vinculada ao conteúdo.
    if (status === "Publicado") {
      const moved = items.find((c) => c.id === id);
      if (moved?.task_id) {
        await updateTask({ id: moved.task_id, status: "Concluída" });
      }
    }
    await refresh();
  }

  async function handleDelete(c: Content) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir "${c.title}"?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteContent(c.id);
    toast.success("Conteúdo excluído");
    await refresh();
  }

  const [view, setView] = useModuleView<string>("content", "list");

  return (
    <div className="space-y-4">
      <ModuleToolbar
        primaryAction={{ label: "Novo conteúdo", icon: Plus, onClick: openCreate }}
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Buscar título, finalidade, roteiro…",
        }}
        resultCount={items.length}
        resultLabel="conteúdos"
        filtersActiveCount={
          (filters.status !== "Todos" ? 1 : 0) +
          (filters.format !== "Todos" ? 1 : 0) +
          (filters.network !== "Todas" ? 1 : 0)
        }
        filters={
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v as StatusFilter }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos os status</SelectItem>
                  {CONTENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Formato</label>
              <Select
                value={filters.format}
                onValueChange={(v) => setFilters((f) => ({ ...f, format: v as FormatFilter }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos formatos</SelectItem>
                  {CONTENT_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Rede</label>
              <Select
                value={filters.network}
                onValueChange={(v) => setFilters((f) => ({ ...f, network: v as NetworkFilter }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todas">Todas redes</SelectItem>
                  {networkOptions.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Film className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum conteúdo ainda. Clica em "Novo conteúdo".
        </div>
      )}

      {items.length > 0 && (
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="calendar">Calendário editorial</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <ContentList
              items={items}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          </TabsContent>

          <TabsContent value="calendar">
            <ContentCalendar items={items} onEdit={openEdit} />
          </TabsContent>

          <TabsContent value="kanban">
            <ContentKanban items={items} onEdit={openEdit} onMove={handleMove} />
          </TabsContent>
        </Tabs>
      )}

      <ContentForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setFormDefaults(null); }}
        content={editing}
        defaults={formDefaults ?? undefined}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

