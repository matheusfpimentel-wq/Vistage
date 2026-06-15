import { useCallback, useEffect, useMemo, useState } from "react";
import { Film, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteContent, getContentStats, listContent, type ContentFilters, type ContentStats } from "./api";
import {
  CONTENT_FORMATS,
  CONTENT_NETWORKS,
  CONTENT_STATUSES,
  type Content,
  type ContentFormat,
  type ContentNetwork,
  type ContentStatus,
} from "./types";
import { useNewItemShortcut } from "@/lib/shortcuts";

type StatusFilter = ContentStatus | "Todos";
type FormatFilter = ContentFormat | "Todos";
type NetworkFilter = ContentNetwork | "Todas";

export function ContentPage() {
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

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(c: Content) {
    setEditing(c);
    setFormOpen(true);
  }

  async function handleDelete(c: Content) {
    if (!window.confirm(`Excluir "${c.title}"?`)) return;
    await deleteContent(c.id);
    toast.success("Conteúdo excluído");
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total" value={stats?.total.toString() ?? "—"} />
        <Kpi
          label="Publicados no mês"
          value={stats?.publishedThisMonth.toString() ?? "—"}
        />
        <Kpi
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

      <div className="flex flex-wrap items-end justify-between gap-3">
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
              {CONTENT_NETWORKS.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo conteúdo
        </Button>
      </div>

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
            <ContentKanban items={items} onEdit={openEdit} />
          </TabsContent>
        </Tabs>
      )}

      <ContentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        content={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
