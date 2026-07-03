import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, PartyPopper, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { useNewItemShortcut } from "@/lib/shortcuts";
import { PARTY_STATUSES, type PartyDeserialized, type PartyStatus } from "./types";
import { deleteParty, listParties } from "./api";
import { PartyForm } from "./forms/PartyForm";
import { PartyList } from "./views/PartyList";
import { PartyCards } from "./views/PartyCards";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { useModuleView } from "@/lib/moduleView";
import { ListDensityToggle, useListDensity } from "@/components/shared/ListDensityToggle";

type StatusFilter = PartyStatus | "Todas";

export function PartiesPage() {
  const [parties, setParties] = useState<PartyDeserialized[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todas");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartyDeserialized | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const refresh = useCallback(async () => {
    try {
      const rows = await listParties();
      setParties(rows);
    } catch (e) {
      toast.error(`Erro ao carregar festas: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(p: PartyDeserialized) {
    setEditing(p);
    setFormOpen(true);
  }

  // Alertas de festa abrem aqui: ?new=1 → nova festa em branco; ?open=<id> →
  // edita a festa que gerou o alerta (resolve da lista já carregada).
  useEffect(() => {
    if (searchParams.get("new")) {
      openCreate();
      setSearchParams({}, { replace: true });
      return;
    }
    const openId = searchParams.get("open");
    if (!openId) return;
    const party = parties.find((p) => p.id === Number(openId));
    if (party) {
      openEdit(party);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, parties]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(p: PartyDeserialized) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir a produção "${p.title}"?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteParty(p.id);
    toast.success("Produção excluída");
    await refresh();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter((p) => {
      if (statusFilter !== "Todas" && p.status !== statusFilter) return false;
      if (q) {
        const hay = `${p.title} ${p.venue_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [parties, search, statusFilter]);

  const [view, setView] = useModuleView<"cards" | "lista">("parties", "cards");
  const [density, setDensity] = useListDensity("parties");

  return (
    <div className="space-y-4">
      <ModuleToolbar
        primaryAction={{ label: "Nova produção", icon: Plus, onClick: openCreate }}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar título, venue…",
        }}
        resultCount={filtered.length}
        resultLabel="produções"
        filtersActiveCount={statusFilter !== "Todas" ? 1 : 0}
        filters={
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todas">Todos os status</SelectItem>
                {PARTY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : parties.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="Nenhuma produção ainda."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nova produção
            </Button>
          }
        />
      ) : (
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="lista">Lista</TabsTrigger>
            </TabsList>
            {view === "lista" && (
              <ListDensityToggle value={density} onChange={setDensity} />
            )}
          </div>
          <TabsContent value="cards" className="pt-2">
            <PartyCards parties={filtered} onEdit={openEdit} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="lista" className="pt-2">
            <PartyList
              parties={filtered}
              onEdit={openEdit}
              onDelete={handleDelete}
              density={density}
            />
          </TabsContent>
        </Tabs>
      )}

      <PartyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        party={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

