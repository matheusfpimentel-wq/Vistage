import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
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
import { getDb } from "@/lib/db";
import { confirmDialog } from "@/components/ui/confirm";
import { GigForm } from "./forms/GigForm";
import { DebriefForm } from "./forms/DebriefForm";
import { deleteGigFromCalendar } from "@/lib/gcal";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { ListView } from "./views/ListView";
import { BulkListView } from "./views/BulkListView";
import { CalendarView } from "./views/CalendarView";
import { InsightsView } from "./views/InsightsView";
import { SpreadsheetView } from "./views/SpreadsheetView";
import {
  deleteGig,
  getGig,
  listGigs,
  updateGig,
  type GigFilters,
} from "./api";
import { GIG_STATUSES, type Gig, type GigStatus } from "./types";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { useModuleView } from "@/lib/moduleView";

type StatusFilter = GigStatus | "Todas";

export function GigsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [filters, setFilters] = useState<{ status: StatusFilter; search: string; eventCategory: string; recurringEventName: string }>(
    { status: "Todas", search: "", eventCategory: "all", recurringEventName: "all" }
  );
  const [recurringNames, setRecurringNames] = useState<string[]>([]);
  const [view, setView] = useModuleView<"list" | "bulk" | "sheet" | "calendar" | "insights">("gigs", "list");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Gig | null>(null);

  const [debriefOpen, setDebriefOpen] = useState(false);
  const [debriefGig, setDebriefGig] = useState<Gig | null>(null);
  const [debriefRequired, setDebriefRequired] = useState(false);

  // Aba inicial do editor (ex.: "prep" ao clicar em Preparar/Debrief na lista).
  const [formInitialTab, setFormInitialTab] = useState<string | undefined>(undefined);

  const [refreshKey, setRefreshKey] = useState(0);

  const queryFilters: GigFilters = useMemo(
    () => ({
      status: filters.status,
      search: filters.search,
      eventCategory: filters.eventCategory !== "all" ? filters.eventCategory : undefined,
      recurringEventName: filters.recurringEventName !== "all" ? filters.recurringEventName : undefined,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    try {
      const data = await listGigs(queryFilters);
      setGigs(data);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(`Erro ao carregar GIGs: ${String(e)}`);
    }
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const db = getDb();
        const rows = await db.select<{ recurring_event_name: string }[]>(
          "SELECT DISTINCT recurring_event_name FROM gigs WHERE recurring_event_name IS NOT NULL AND recurring_event_name != '' ORDER BY recurring_event_name"
        );
        setRecurringNames(rows.map((r) => r.recurring_event_name));
      } catch { /* silently ignore */ }
    })();
  }, [refreshKey]);

  useEffect(() => {
    const debriefId = searchParams.get("debrief");
    if (debriefId) {
      const id = Number(debriefId);
      void getGig(id).then((gig) => {
        if (gig) openPrepTab(gig);
      });
      setSearchParams({}, { replace: true });
      return;
    }
    const openId = searchParams.get("open");
    if (!openId) return;
    const id = Number(openId);
    void getGig(id).then((gig) => {
      if (gig) {
        setEditing(gig);
        setFormOpen(true);
      }
    });
    setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(gig: Gig) {
    setEditing(gig);
    setFormInitialTab(undefined);
    setFormOpen(true);
  }

  // Preparar/Debrief na lista abrem a GIG no editar, já na aba de preparação/
  // debrief — em vez de uma janela separada.
  function openPrepTab(gig: Gig) {
    setEditing(gig);
    setFormInitialTab("prep");
    setFormOpen(true);
  }

  async function handleSaved({
    id,
    statusChanged,
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
      <ModuleToolbar
        primaryAction={{ label: "Nova GIG", icon: Plus, onClick: openCreate }}
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Buscar venue, cidade, briefing…",
        }}
        resultCount={gigs.length}
        filtersActiveCount={
          (filters.status !== "Todas" ? 1 : 0) +
          (filters.eventCategory !== "all" ? 1 : 0) +
          (filters.recurringEventName !== "all" ? 1 : 0)
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
                  <SelectItem value="Todas">Todos os status</SelectItem>
                  {GIG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <Select
                value={filters.eventCategory}
                onValueChange={(v) => setFilters((f) => ({ ...f, eventCategory: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  <SelectItem value="Evento Social">Evento Social</SelectItem>
                  <SelectItem value="Festa">Festa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurringNames.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Festa recorrente</label>
                <Select
                  value={filters.recurringEventName}
                  onValueChange={(v) => setFilters((f) => ({ ...f, recurringEventName: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todas as festas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as festas</SelectItem>
                    {recurringNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        }
      />

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="bulk">Seleção múltipla</TabsTrigger>
          <TabsTrigger value="sheet">Planilha</TabsTrigger>
          <TabsTrigger value="calendar">Calendário</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <ListView
            gigs={gigs}
            onEdit={openEdit}
            onPrep={openPrepTab}
            onDebrief={openPrepTab}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="bulk">
          <BulkListView
            gigs={gigs}
            onEdit={openEdit}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="sheet">
          <SpreadsheetView gigs={gigs} onRefresh={refresh} />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarView gigs={gigs} onEdit={openEdit} />
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
        onDebrief={editing ? () => openDebrief(editing) : undefined}
        initialTab={formInitialTab}
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
