import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Film, Plus, Search } from "lucide-react";
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
import { ContentForm } from "./forms/ContentForm";
import { ContentList } from "./views/ContentList";
import { ContentKanban } from "./views/ContentKanban";
import { ContentCalendar } from "./views/ContentCalendar";
import { deleteContent, getContentStats, listContent, updateContent, type ContentFilters, type ContentStats } from "./api";
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
import { KpiCard } from "@/components/shared/KpiCard";
import { loadIdentity } from "@/modules/identity/api";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { PageToolbar } from "@/components/shared/PageToolbar";

type StatusFilter = ContentStatus | "Todos";
type FormatFilter = ContentFormat | "Todos";
type NetworkFilter = ContentNetwork | "Todas";

export function ContentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Content[]>([]);
  const [stats, setStats] = useState<ContentStats | null>(null);
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
    const [data, s] = await Promise.all([
      listContent(queryFilters),
      getContentStats(),
    ]);
    setItems(data);
    setStats(s);
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total" value={stats?.total.toString() ?? "—"} />
        <KpiCard
          label="Publicados no mês"
          value={stats?.publishedThisMonth.toString() ?? "—"}
        />
        <KpiCard
          label="Em produção"
          value={
            stats
              ? (
                  (stats.byStatus.Roteiro ?? 0) +
                  (stats.byStatus.Gravando ?? 0) +
                  (stats.byStatus["Edição"] ?? 0)
                ).toString()
              : "—"
          }
        />
      </div>

      <PageToolbar
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo conteúdo
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar título, finalidade, roteiro…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-72 pl-8"
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, status: v as StatusFilter }))
            }
          >
            <SelectTrigger className="w-44">
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
          <Select
            value={filters.format}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, format: v as FormatFilter }))
            }
          >
            <SelectTrigger className="w-40">
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
          <Select
            value={filters.network}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, network: v as NetworkFilter }))
            }
          >
            <SelectTrigger className="w-40">
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
      </PageToolbar>

      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Film className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum conteúdo ainda. Clica em "Novo conteúdo".
        </div>
      )}

      {items.length > 0 && (
        <Tabs defaultValue="list">
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

