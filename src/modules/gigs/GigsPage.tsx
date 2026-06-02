import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
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
import { confirmDialog } from "@/components/ui/confirm";
import { GigForm } from "./forms/GigForm";
import { DebriefForm } from "./forms/DebriefForm";
import { deleteGigFromCalendar } from "@/lib/gcal";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { ListView } from "./views/ListView";
import { CalendarView } from "./views/CalendarView";
import { KanbanView } from "./views/KanbanView";
import { InsightsView } from "./views/InsightsView";
import {
  deleteGig,
  getGig,
  listGigs,
  updateGig,
  type GigFilters,
} from "./api";
import { GIG_STATUSES, type Gig, type GigStatus } from "./types";

type StatusFilter = GigStatus | "Todas";

export function GigsPage() {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [filters, setFilters] = useState<{ status: StatusFilter; search: string }>(
    { status: "Todas", search: "" }
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Gig | null>(null);

  const [debriefOpen, setDebriefOpen] = useState(false);
  const [debriefGig, setDebriefGig] = useState<Gig | null>(null);
  const [debriefRequired, setDebriefRequired] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const queryFilters: GigFilters = useMemo(
    () => ({ status: filters.status, search: filters.search }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const data = await listGigs(queryFilters);
    setGigs(data);
    setRefreshKey((k) => k + 1);
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(gig: Gig) {
    setEditing(gig);
    setFormOpen(true);
  }

  async function handleSaved({
    id,
    statusChanged,
    isNew,
  }: {
    id: number;
    statusChanged: boolean;
    isNew: boolean;
  }) {
    const fresh = await getGig(id);
    if (!fresh) {
      await refresh();
      return;
    }

    void isNew; // sem mais sugestão automática — agora o checklist vive na GIG

    // Se acabou de virar Concluída e ainda não tem debrief preenchido,
    // dispara o modal de debrief em modo obrigatório.
    const justCompleted =
      statusChanged &&
      fresh.status === "Concluída" &&
      !fresh.debrief_completed_at;

    if (justCompleted) {
      // marca como pendente imediatamente para já refletir no dashboard
      // caso o usuário desista
      if (fresh.debrief_pending !== 1) {
        await updateGig({ id: fresh.id, debrief_pending: 1 });
      }
      const updated = await getGig(id);
      setDebriefGig(updated ?? fresh);
      setDebriefRequired(true);
      setDebriefOpen(true);
    }
    await refresh();
  }

  function openDebrief(gig: Gig) {
    setDebriefGig(gig);
    setDebriefRequired(gig.debrief_pending === 1 && gig.status === "Concluída");
    setDebriefOpen(true);
  }

  async function handleDelete(gig: Gig) {
    const ok = await confirmDialog({
      title: "Excluir",
      description: `Excluir a GIG de "${gig.venue_name}" em ${gig.date}? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      // tenta deletar o evento espelhado no Google Calendar antes — não bloqueia se falhar
      await deleteGigFromCalendar(gig);
      await deleteGig(gig.id);
      toast.success("GIG excluída");
      await refresh();
    } catch (e) {
      toast.error(`Erro ao excluir: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar venue, cidade, briefing…"
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
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todos os status</SelectItem>
              {GIG_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nova GIG
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="calendar">Calendário</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <ListView
            gigs={gigs}
            onEdit={openEdit}
            onDebrief={openDebrief}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarView gigs={gigs} onEdit={openEdit} />
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanView gigs={gigs} onEdit={openEdit} />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsView refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>

      <GigForm
        open={formOpen}
        onOpenChange={setFormOpen}
        gig={editing}
        onSaved={handleSaved}
      />

      {debriefGig && (
        <DebriefForm
          open={debriefOpen}
          onOpenChange={setDebriefOpen}
          gig={debriefGig}
          required={debriefRequired}
          onCompleted={() => void refresh()}
        />
      )}

    </div>
  );
}
