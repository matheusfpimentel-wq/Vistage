import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PartyPopper, Plus, Search } from "lucide-react";
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
import { useNewItemShortcut } from "@/lib/shortcuts";
import { PARTY_STATUSES, type PartyDeserialized, type PartyStatus, estimatedRevenue } from "./types";
import { deleteParty, listParties } from "./api";
import { PartyForm } from "./forms/PartyForm";
import { PartyList } from "./views/PartyList";
import { PartyCards } from "./views/PartyCards";

type StatusFilter = PartyStatus | "Todas";

const formatCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PartiesPage() {
  const [parties, setParties] = useState<PartyDeserialized[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todas");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartyDeserialized | null>(null);

  const refresh = useCallback(async () => {
    const rows = await listParties();
    setParties(rows);
    setLoading(false);
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

  async function handleDelete(p: PartyDeserialized) {
    if (!window.confirm(`Excluir a festa "${p.title}"?`)) return;
    await deleteParty(p.id);
    toast.success("Festa excluída");
    await refresh();
  }

  const today = new Date().toISOString().slice(0, 10);

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

  const upcoming = parties.filter(
    (p) =>
      (p.status === "Planejando" || p.status === "Confirmada") &&
      (p.date == null || p.date >= today)
  );
  const realized = parties.filter((p) => p.status === "Realizada");
  const estimatedTotal = upcoming.reduce((sum, p) => sum + estimatedRevenue(p), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Festas</h2>
          <p className="text-sm text-muted-foreground">
            Produção e gestão de eventos próprios.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nova festa
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Próximas" value={upcoming.length} />
        <Kpi label="Realizadas" value={realized.length} />
        <KpiCurrency label="Receita estimada" value={estimatedTotal} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar título, venue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-40">
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : parties.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <PartyPopper className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhuma festa cadastrada. Clique em "Nova festa" para começar.
        </div>
      ) : (
        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
          </TabsList>
          <TabsContent value="cards" className="pt-2">
            <PartyCards parties={filtered} onEdit={openEdit} />
          </TabsContent>
          <TabsContent value="lista" className="pt-2">
            <PartyList
              parties={filtered}
              onEdit={openEdit}
              onDelete={handleDelete}
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

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function KpiCurrency({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {formatCurrency(value)}
      </div>
    </div>
  );
}
