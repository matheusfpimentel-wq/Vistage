import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderPlus,
  Gift,
  Heart,
  LayoutGrid,
  List,
  Pencil,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  User,
  Users,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCards } from "@/components/shared/Skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { LevelBadge } from "./components/LevelBadge";
import { FanForm } from "./forms/FanForm";
import { FanDetail } from "./forms/FanDetail";
import { FanClubConfigSurface } from "./components/FanClubConfigSurface";
import { FanTodayView } from "./components/FanTodayView";
import {
  addFanGroupMember,
  addFanToGroupIfAbsent,
  createFanGroup,
  deleteFan,
  deleteFanGroup,
  deleteFanSegment,
  getFan,
  listFanGroupMap,
  listFanGroupMembers,
  listFanGroups,
  listFanInteractionCounts,
  listFanPerkCounts,
  listFans,
  listFanOrigens,
  listFanSegments,
  createFanSegment,
  parseFanSegmentCriterios,
  runFanAutoRules,
  removeFanGroupMember,
  updateFanGroup,
  listFanGroupStats,
  type FanFilters,
} from "./api";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { FAN_LEVELS, type Fan, type FanGroup, type FanGroupMember, type FanLevel, type FanSegment } from "./types";
import { EMPTY_VALUE, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { ColResizer, useResizableColumns } from "@/lib/resizableColumns";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { useImageUrl } from "@/lib/uploads";
import { useModuleView } from "@/lib/moduleView";
import { PendingTasksBadge } from "@/modules/tasks/components/PendingTasksBadge";
import { PendingTasksProvider } from "@/modules/tasks/components/PendingTasksContext";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { ViewToggle } from "@/components/shared/ViewToggle";

type LevelFilter = FanLevel | "Todos";
type ViewMode = "cards" | "list";

// Filtros do roster (versão "form", em strings) + conversão pro FanFilters da API.
type RosterFilters = {
  level: LevelFilter;
  city: string;
  search: string;
  groupId: string;
  origem: string;
  minDays: string; // "sem contato há +N dias"
  hasPerk: string; // "" | "yes" | "no"
  ambassador: boolean;
  attendedGigId: string;
  wasVip: string; // "" | "yes"
};

const EMPTY_FILTERS: RosterFilters = {
  level: "Todos", city: "", search: "", groupId: "", origem: "", minDays: "", hasPerk: "", ambassador: false, attendedGigId: "", wasVip: "",
};

function rosterToQuery(f: RosterFilters): FanFilters {
  const q: FanFilters = { level: f.level, city: f.city, search: f.search };
  if (f.groupId) q.groupId = Number(f.groupId);
  if (f.origem) q.origem = f.origem;
  if (f.minDays) q.minDays = Number(f.minDays);
  if (f.hasPerk === "yes") q.hasPerk = true;
  else if (f.hasPerk === "no") q.hasPerk = false;
  if (f.ambassador) q.ambassador = true;
  if (f.attendedGigId) q.attendedGigId = Number(f.attendedGigId);
  if (f.wasVip === "yes") q.wasVip = true;
  return q;
}

function queryToRoster(q: FanFilters): RosterFilters {
  return {
    level: (q.level as LevelFilter) ?? "Todos",
    city: q.city ?? "",
    search: q.search ?? "",
    groupId: q.groupId != null ? String(q.groupId) : "",
    origem: q.origem ?? "",
    minDays: q.minDays != null ? String(q.minDays) : "",
    hasPerk: q.hasPerk === true ? "yes" : q.hasPerk === false ? "no" : "",
    ambassador: q.ambassador === true,
    attendedGigId: q.attendedGigId != null ? String(q.attendedGigId) : "",
    wasVip: q.wasVip === true ? "yes" : "",
  };
}

/** Conta os filtros do PAINEL ativos (busca fica fora — vive na barra de busca). */
function countActiveFilters(f: RosterFilters): number {
  return (
    (f.level !== "Todos" ? 1 : 0) +
    (f.city.trim() ? 1 : 0) +
    (f.groupId ? 1 : 0) +
    (f.origem ? 1 : 0) +
    (f.minDays ? 1 : 0) +
    (f.hasPerk ? 1 : 0) +
    (f.ambassador ? 1 : 0) +
    (f.attendedGigId ? 1 : 0) +
    (f.wasVip ? 1 : 0)
  );
}

/**
 * Linha da tabela = Fã + campos derivados só pra ordenar colunas que não mapeiam
 * direto num campo do Fan: grupo(s), contato (instagram/email/telefone coalescido)
 * e contagem de interações.
 */
type FanRow = Fan & {
  _group: string | null;
  _contact: string | null;
  _interactions: number;
};

export function FansPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fans, setFans] = useState<Fan[]>([]);
  const [loading, setLoading] = useState(true);
  const [interactionCounts, setInteractionCounts] = useState<Map<number, number>>(new Map());
  const [perkCounts, setPerkCounts] = useState<Map<number, number>>(new Map());
  // Mapa fã→grupos (multi-grupo): chips na lista + visão agrupada em pastas.
  const [groupMap, setGroupMap] = useState<Map<number, { id: number; name: string }[]>>(new Map());
  const [filters, setFilters] = useState<RosterFilters>({ ...EMPTY_FILTERS });
  // Dados auxiliares dos dropdowns de filtro (carregados uma vez).
  const [groups, setGroups] = useState<FanGroup[]>([]);
  const [gigOptions, setGigOptions] = useState<{ id: number; label: string }[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [segName, setSegName] = useState("");
  const [savingSeg, setSavingSeg] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fan | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [view, setView] = useModuleView<ViewMode>("fans", "list");
  // "Agrupar por grupo" → visão de pastas colapsáveis. Preferência da máquina
  // (localStorage), no mesmo espírito do useModuleView; não viaja no .vistage.
  const [groupBy, setGroupBy] = useState<boolean>(() => {
    try {
      return localStorage.getItem("vistage.fans.groupBy") === "1";
    } catch {
      return false;
    }
  });
  const toggleGroupBy = useCallback((on: boolean) => {
    setGroupBy(on);
    try {
      localStorage.setItem("vistage.fans.groupBy", on ? "1" : "0");
    } catch {
      /* storage indisponível */
    }
  }, []);
  // "Próximas ações" (valor "hoje") é a aba PADRÃO — mas a última aberta fica
  // guardada (localStorage), pra o módulo reabrir onde o usuário deixou.
  const [section, setSection] = useModuleView<"fas" | "hoje" | "grupos" | "config">("fans-section", "hoje");
  // Linhas augmentadas com campos derivados pra ordenar Grupo/Contato/Interações
  // (que não mapeiam direto num campo do Fan). FanRow estende Fan, então o que
  // consome `sortedFans` como Fan[] (ex.: GroupedFansView) segue funcionando.
  const fanRows: FanRow[] = useMemo(
    () =>
      fans.map((f) => ({
        ...f,
        _group: (groupMap.get(f.id) ?? []).map((g) => g.name).join(", ") || null,
        _contact: f.instagram ?? f.email ?? f.phone ?? null,
        _interactions: interactionCounts.get(f.id) ?? 0,
      })),
    [fans, groupMap, interactionCounts]
  );
  const { sorted: sortedFans, sortKey, sortDir, handleSort } = useTableSort(fanRows);
  const cols = useResizableColumns("fans", [
    { id: "name", width: 240, min: 140 },
    { id: "level", width: 120 },
    { id: "city", width: 150 },
    { id: "group", width: 160 },
    { id: "contact", width: 180 },
    { id: "last", width: 160 },
    { id: "interactions", width: 110 },
    { id: "actions", width: 96, min: 80 },
  ]);
  const tableWidth = cols.defs.reduce((s, c) => s + cols.widths[c.id], 0);

  const queryFilters: FanFilters = useMemo(() => rosterToQuery(filters), [filters]);

  // Dados dos dropdowns de filtro — carregados uma vez (grupos/gigs/origens).
  useEffect(() => {
    void listFanGroups().then(setGroups).catch(() => {});
    void listGigs()
      .then((gs) => setGigOptions(gs.map((g) => ({ id: g.id, label: gigDisplayName(g) }))))
      .catch(() => {});
    void listFanOrigens().then(setOrigens).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, counts, perks, gmap, gs] = await Promise.all([
        listFans(queryFilters),
        listFanInteractionCounts().catch(() => new Map<number, number>()),
        listFanPerkCounts().catch(() => new Map<number, number>()),
        listFanGroupMap().catch(() => new Map<number, { id: number; name: string }[]>()),
        listFanGroups().catch(() => [] as FanGroup[]),
      ]);
      setFans(data);
      setInteractionCounts(counts);
      setPerkCounts(perks);
      setGroupMap(gmap);
      setGroups(gs);
    } catch (e) {
      toast.error(`Erro ao carregar fãs: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Roda as ações programadas (regras gatilho→ação) uma vez ao abrir o Clube de
  // Fãs, DEPOIS do primeiro load. Idempotente (marcador [auto:<ruleId>] por
  // regra×fã), então chamar a cada abertura não duplica nada. Não roda no boot do
  // app (evita escrever antes de o rastreio de "não salvo" assentar). Se algo
  // disparar, refaz o load pra refletir os novos perks/interações/tarefas.
  useEffect(() => {
    void runFanAutoRules()
      .then((fired) => {
        if (fired > 0) void refresh();
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const id = Number(openId);
    void getFan(id).then((fan) => {
      if (fan) {
        setDetailId(fan.id);
        setDetailOpen(true);
      }
    });
    setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openDetail(f: Fan) {
    setDetailId(f.id);
    setDetailOpen(true);
  }

  async function handleDelete(f: Fan) {
    const ok = await confirmDialog({ title: "Excluir", description: `Excluir "${f.name}"? Interações vinculadas também serão removidas.`, confirmLabel: "Excluir", destructive: true });
    if (!ok) return;
    try {
      await deleteFan(f.id);
      toast.success("Fã excluído");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  /** Cria um grupo na hora (sem sair da lista) e atualiza pastas/chips. */
  async function handleCreateGroupInline(name: string) {
    const nome = name.trim();
    if (!nome) return;
    try {
      await createFanGroup({ name: nome, whatsapp_group: null, origin: null, notes: null });
      await refresh();
      toast.success(`Grupo "${nome}" criado`);
    } catch (e) {
      toast.error(`Erro ao criar grupo: ${String(e)}`);
    }
  }

  /**
   * Soltar um fã numa pasta de grupo: ADICIONA ao grupo (multi-grupo — NÃO remove
   * de outros). Idempotente: se já for membro, não duplica.
   */
  async function handleDropFanOnGroup(fanId: number, group: { id: number; name: string }) {
    try {
      const added = await addFanToGroupIfAbsent(group.id, fanId);
      await refresh();
      if (added) toast.success(`Adicionado ao grupo ${group.name}`);
      else toast.info(`Já estava no grupo ${group.name}`);
    } catch (e) {
      toast.error(`Erro ao adicionar ao grupo: ${String(e)}`);
    }
  }

  async function handleSaveSegment() {
    const nome = segName.trim();
    if (!nome || countActiveFilters(filters) === 0 || savingSeg) return;
    setSavingSeg(true);
    try {
      await createFanSegment(nome, queryFilters);
      toast.success(`Segmento "${nome}" salvo`);
      setSegName("");
    } catch (e) {
      toast.error(`Erro ao salvar segmento: ${String(e)}`);
    } finally {
      setSavingSeg(false);
    }
  }

  /** Aplica os critérios de um segmento ao roster e volta pra aba Fãs. */
  function applySegment(criterios: FanFilters) {
    setFilters(queryToRoster(criterios));
    setSection("fas");
  }

  return (
    <div className="space-y-4">
      <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)}>
        <TabsList>
          <TabsTrigger value="fas">Fãs</TabsTrigger>
          <TabsTrigger value="hoje">Próximas ações</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Configurar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fas" className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
      <ModuleToolbar
        primaryAction={{ label: "Novo fã", icon: Plus, onClick: openCreate }}
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Buscar nome, @, email, telefone…",
        }}
        filtersActiveCount={countActiveFilters(filters)}
        filters={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterSelect
                label="Nível"
                value={filters.level}
                onChange={(v) => setFilters((f) => ({ ...f, level: v as LevelFilter }))}
                options={[{ value: "Todos", label: "Todos os níveis" }, ...FAN_LEVELS.map((l) => ({ value: l, label: l }))]}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cidade</label>
                <Input
                  placeholder="Cidade"
                  value={filters.city}
                  onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <FilterSelect
                label="Grupo"
                value={filters.groupId || "none"}
                onChange={(v) => setFilters((f) => ({ ...f, groupId: v === "none" ? "" : v }))}
                options={[{ value: "none", label: "Qualquer grupo" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
              />
              <FilterSelect
                label="Origem"
                value={filters.origem || "none"}
                onChange={(v) => setFilters((f) => ({ ...f, origem: v === "none" ? "" : v }))}
                options={[{ value: "none", label: "Qualquer origem" }, ...origens.map((o) => ({ value: o, label: o }))]}
              />
              <FilterSelect
                label="Sem contato há"
                value={filters.minDays || "0"}
                onChange={(v) => setFilters((f) => ({ ...f, minDays: v === "0" ? "" : v }))}
                options={[
                  { value: "0", label: "Qualquer tempo" },
                  { value: "7", label: "+7 dias" },
                  { value: "15", label: "+15 dias" },
                  { value: "30", label: "+30 dias" },
                  { value: "60", label: "+60 dias" },
                  { value: "90", label: "+90 dias" },
                ]}
              />
              <FilterSelect
                label="Perks"
                value={filters.hasPerk || "any"}
                onChange={(v) => setFilters((f) => ({ ...f, hasPerk: v === "any" ? "" : v }))}
                options={[{ value: "any", label: "Tanto faz" }, { value: "yes", label: "Com perk" }, { value: "no", label: "Sem perk" }]}
              />
              <FilterSelect
                label="Já foi VIP"
                value={filters.wasVip || "any"}
                onChange={(v) => setFilters((f) => ({ ...f, wasVip: v === "any" ? "" : v }))}
                options={[{ value: "any", label: "Tanto faz" }, { value: "yes", label: "Sim" }]}
              />
              <FilterSelect
                label="Esteve na GIG"
                value={filters.attendedGigId || "none"}
                onChange={(v) => setFilters((f) => ({ ...f, attendedGigId: v === "none" ? "" : v }))}
                options={[{ value: "none", label: "Qualquer GIG" }, ...gigOptions.map((g) => ({ value: String(g.id), label: g.label }))]}
              />
              <label className="flex items-center gap-2 pt-5 text-sm">
                <input
                  type="checkbox"
                  checked={filters.ambassador}
                  onChange={(e) => setFilters((f) => ({ ...f, ambassador: e.target.checked }))}
                  className="h-4 w-4 rounded border"
                />
                Só embaixadores
              </label>
            </div>

            <div className="flex items-center gap-2 border-t pt-3">
              {countActiveFilters(filters) > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS, search: filters.search })}>
                  Limpar filtros
                </Button>
              )}
              {/* Salvar como segmento mora no menu "Filtros salvos", ao lado da busca. */}
              <p className="ml-auto text-xs text-muted-foreground">
                Salve estes filtros em “Filtros salvos”.
              </p>
            </div>
          </div>
        }
        viewToggle={
          <ViewToggle
            options={[
              { value: "cards", label: "Cards", icon: LayoutGrid },
              { value: "list", label: "Lista", icon: List },
            ]}
            value={view}
            onChange={setView}
          />
        }
        resultCount={fans.length}
        resultLabel="fãs"
      />
        </div>
        {/* Filtros salvos (segmentos) — aplica/cria/exclui filtros reutilizáveis,
            ao lado da barra de busca. As listas VIP foram movidas pra GIG. */}
        <FanSavedFiltersMenu
          onApply={applySegment}
          onSaveCurrent={() => void handleSaveSegment()}
          canSaveCurrent={countActiveFilters(filters) > 0}
          savingSegment={savingSeg}
          segName={segName}
          onSegNameChange={setSegName}
        />
      </div>

      {/* Agrupar por grupo (visão de pastas) + criar grupo na hora. Multi-grupo:
          arrastar um fã pra uma pasta ADICIONA ao grupo, sem remover dos outros. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={groupBy ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => toggleGroupBy(!groupBy)}
          aria-pressed={groupBy}
        >
          <Users className="h-4 w-4" /> Agrupar por grupo
        </Button>
        <NewGroupInline onCreate={handleCreateGroupInline} />
        {groupBy && (
          <p className="text-xs text-muted-foreground">
            Arraste um fã para uma pasta para adicioná-lo ao grupo.
          </p>
        )}
      </div>

      {loading ? (
        <SkeletonCards />
      ) : fans.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={filters.search || filters.level !== "Todos" || filters.city.trim() ? "Nenhum fã com esses filtros." : "Comece seu Clube de Fãs."}
          description={
            filters.search || filters.level !== "Todos" || filters.city.trim()
              ? "Ajuste a busca ou os filtros."
              : "Cadastre quem acompanha seu trabalho. O nível de cada um cresce com presença, interação e feedback, e decai sozinho com o tempo."
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo fã
            </Button>
          }
        />
      ) : groupBy ? (
        <PendingTasksProvider entityType="fan">
          <GroupedFansView
            fans={sortedFans}
            groups={groups}
            groupMap={groupMap}
            view={view}
            interactionCounts={interactionCounts}
            perkCounts={perkCounts}
            onOpen={openDetail}
            onDelete={(f) => void handleDelete(f)}
            onDropFanOnGroup={(fanId, g) => void handleDropFanOnGroup(fanId, g)}
          />
        </PendingTasksProvider>
      ) : view === "cards" ? (
        <PendingTasksProvider entityType="fan">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {fans.map((f) => (
            <FanCard
              key={f.id}
              fan={f}
              interactionCount={interactionCounts.get(f.id) ?? 0}
              perkCount={perkCounts.get(f.id) ?? 0}
              groups={groupMap.get(f.id) ?? []}
              onOpen={() => openDetail(f)}
              onEdit={() => openDetail(f)}
              onDelete={() => void handleDelete(f)}
            />
          ))}
        </div>
        </PendingTasksProvider>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="table-fixed text-sm" style={{ width: tableWidth }}>
            <colgroup>
              {cols.defs.map((c) => (
                <col key={c.id} style={cols.colStyle(c.id)} />
              ))}
            </colgroup>
            <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground">
              <tr>
                <SortableHeader<FanRow> col="name" label="Nome" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("name")} />
                </SortableHeader>
                <SortableHeader<FanRow> col="level" label="Nível" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("level")} />
                </SortableHeader>
                <SortableHeader<FanRow> col="city" label="Cidade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("city")} />
                </SortableHeader>
                <SortableHeader<FanRow> col="_group" label="Grupo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("group")} />
                </SortableHeader>
                <SortableHeader<FanRow> col="_contact" label="Contato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("contact")} />
                </SortableHeader>
                <SortableHeader<FanRow> col="last_interaction_at" label="Último contato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("last")} />
                </SortableHeader>
                <SortableHeader<FanRow> col="_interactions" label="Interações" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("interactions")} />
                </SortableHeader>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedFans.map((f) => {
                const last = f.last_interaction_at;
                const daysAgo = last
                  ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
                  : null;
                return (
                  <tr
                    key={f.id}
                    className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                    onClick={() => openDetail(f)}
                  >
                    <td className="px-3 py-2">
                      <FanListAvatar fan={f} />
                    </td>
                    <td className="px-3 py-2">
                      <LevelBadge level={f.level} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {f.city ?? EMPTY_VALUE}
                    </td>
                    <td className="px-3 py-2">
                      <FanGroupChips groups={groupMap.get(f.id) ?? []} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {f.instagram ?? f.email ?? f.phone ?? EMPTY_VALUE}
                    </td>
                    <td className="px-3 py-2">
                      {last ? (
                        <div className="flex flex-col">
                          <span className="text-sm tabular-nums">
                            {formatDate(last)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {daysAgo === 0
                              ? "hoje"
                              : daysAgo === 1
                              ? "ontem"
                              : `há ${daysAgo}d`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{EMPTY_VALUE}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-sm">
                      {interactionCounts.get(f.id) ?? 0}
                    </td>
                    <td
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openDetail(f)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(f)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </TabsContent>

        <TabsContent value="hoje">
          <FanTodayView
            onOpenFan={(id) => {
              setDetailId(id);
              setDetailOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="grupos" className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Grupos</h3>
            <FanGroupsPanel fans={fans} embedded />
          </div>
        </TabsContent>

        <TabsContent value="config">
          <FanClubConfigSurface />
        </TabsContent>
      </Tabs>

      <FanForm
        open={formOpen}
        onOpenChange={setFormOpen}
        fan={editing}
        onSaved={() => void refresh()}
      />

      <FanDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        fanId={detailId}
      />
    </div>
  );
}

/** Descrição curta dos critérios de um segmento (pro menu de filtros salvos). */
function describeSegment(c: FanFilters): string {
  const parts: string[] = [];
  if (c.level && c.level !== "Todos") parts.push(c.level);
  if (c.city) parts.push(`em ${c.city}`);
  if (c.origem) parts.push(`origem ${c.origem}`);
  if (c.minDays) parts.push(`sem contato há +${c.minDays}d`);
  if (c.hasPerk === true) parts.push("com perk");
  else if (c.hasPerk === false) parts.push("sem perk");
  if (c.ambassador) parts.push("embaixadores");
  if (c.groupId) parts.push("de um grupo");
  if (c.attendedGigId) parts.push("foram a uma GIG");
  if (c.wasVip === true) parts.push("já foram VIP");
  if (c.search) parts.push(`"${c.search}"`);
  return parts.length ? parts.join(" · ") : "todos os fãs";
}

// "Filtros salvos" (segmentos = FanFilters serializado, tabela fan_segments).
// Vive ao lado da busca da lista de Fãs: lista os segmentos salvos pra aplicar de
// volta ao roster, salva os filtros atuais como um novo segmento e permite excluir.
// Mesmo padrão de menu do FileMenu (wrapper relativo + clique-fora pra fechar).
function FanSavedFiltersMenu({
  onApply,
  onSaveCurrent,
  canSaveCurrent,
  savingSegment,
  segName,
  onSegNameChange,
}: {
  onApply: (c: FanFilters) => void;
  onSaveCurrent: () => void;
  canSaveCurrent: boolean;
  savingSegment: boolean;
  segName: string;
  onSegNameChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<FanSegment[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setSegments(await listFanSegments());
  }, []);

  // Carrega os segmentos e reage a mudanças (criar/excluir emitem DATA_CHANGED),
  // pra refletir um "salvar segmento" disparado a partir desta mesma barra.
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [refresh]);

  // Fecha ao clicar fora (idêntico ao menu Arquivo).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function handleApply(seg: FanSegment) {
    onApply(parseFanSegmentCriterios(seg.criterios));
    setOpen(false);
  }

  async function handleDelete(seg: FanSegment) {
    const ok = await confirmDialog({
      title: "Excluir segmento",
      description: `Excluir o segmento "${seg.nome}"? (Os fãs não são afetados.)`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteFanSegment(seg.id);
    await refresh();
  }

  const canSave = canSaveCurrent && !!segName.trim() && !savingSegment;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant={segments.length > 0 ? "secondary" : "outline"}
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5"
      >
        <Bookmark className="h-4 w-4" /> Filtros salvos
        {segments.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-xs font-medium text-primary">
            {segments.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border bg-popover shadow-md">
          {/* Salvar os filtros atuais como um novo segmento. */}
          <div className="border-b p-3">
            <div className="text-xs font-medium text-muted-foreground">Salvar filtros atuais</div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                className="h-8 flex-1"
                placeholder="Nome do segmento"
                value={segName}
                onChange={(e) => onSegNameChange(e.target.value)}
                disabled={!canSaveCurrent}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) onSaveCurrent(); }}
              />
              <Button size="sm" className="h-8" disabled={!canSave} onClick={onSaveCurrent}>
                <Save className="h-4 w-4" /> {savingSegment ? "Salvando…" : "Salvar"}
              </Button>
            </div>
            {!canSaveCurrent && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Ative ao menos um filtro pra salvar um segmento.
              </p>
            )}
          </div>

          {/* Lista de segmentos salvos — aplicar de volta ao roster ou excluir. */}
          <div className="max-h-72 overflow-y-auto p-1">
            {segments.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nenhum filtro salvo ainda.</p>
            ) : (
              segments.map((seg) => {
                const c = parseFanSegmentCriterios(seg.criterios);
                return (
                  <div key={seg.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col text-left"
                      onClick={() => handleApply(seg)}
                    >
                      <span className="truncate text-sm font-medium">{seg.nome}</span>
                      <span className="truncate text-xs text-muted-foreground">{describeSegment(c)}</span>
                    </button>
                    <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={() => handleApply(seg)}>
                      <Play className="h-3.5 w-3.5" /> Aplicar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => void handleDelete(seg)}
                      aria-label="Excluir segmento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Select rotulado pro painel de filtros (valores nunca vazios — sentinelas tratadas no onChange).
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FanListAvatar({ fan: f }: { fan: Fan }) {
  const photoUrl = useImageUrl(f.photo_path);
  const initials = f.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {photoUrl ? (
          <img src={photoUrl} alt={f.name} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
            {initials || <User className="h-5 w-5" />}
          </div>
        )}
      </div>
      <span className="font-medium">{f.name}</span>
    </div>
  );
}

function FanCard({
  fan: f,
  interactionCount,
  perkCount,
  groups,
  onOpen,
  onEdit,
  onDelete,
}: {
  fan: Fan;
  interactionCount: number;
  perkCount: number;
  groups: { id: number; name: string }[];
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const photoUrl = useImageUrl(f.photo_path);
  const last = f.last_interaction_at;
  const daysAgo = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : null;
  const initials = f.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const lastLabel =
    daysAgo == null ? null : daysAgo === 0 ? "hoje" : daysAgo === 1 ? "ontem" : `há ${daysAgo}d`;
  const metaLine =
    [
      f.city || null,
      lastLabel ? `contato ${lastLabel}` : null,
      interactionCount > 0
        ? `${interactionCount} interaç${interactionCount === 1 ? "ão" : "ões"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group relative flex cursor-pointer items-center gap-3 overflow-hidden glass-panel p-3 text-left transition hover:border-primary hover:shadow-md"
    >
      {/* ações no hover */}
      <div
        className="absolute bottom-2 right-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 bg-card shadow-sm"
          aria-label="Editar"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 bg-card shadow-sm"
          aria-label="Excluir"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      {/* avatar redondo (igual ao card de CRM) */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted text-lg">
        {photoUrl ? (
          <img src={photoUrl} alt={f.name} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-semibold text-muted-foreground">
            {initials || <User className="h-1/2 w-1/2" />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <span className="block truncate font-medium leading-tight">{f.name}</span>
        {metaLine && (
          <span className="block truncate text-xs text-muted-foreground">{metaLine}</span>
        )}
        {(groups.length > 0 || perkCount > 0) && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {groups.length > 0 && <FanGroupChips groups={groups} max={2} />}
            {perkCount > 0 && (
              <Badge variant="secondary" className="gap-1" title={`${perkCount} perk(s)/brinde(s)`}>
                <Gift className="h-3 w-3" />
                {perkCount}
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <LevelBadge level={f.level} />
        <PendingTasksBadge entityType="fan" entityId={f.id} />
      </div>
    </div>
  );
}

/**
 * Chips dos grupos a que um fã pertence (multi-grupo). Mostra até `max` chips e,
 * se houver mais, um "+N". Discreto: pensado pra célula da lista e pro card.
 */
function FanGroupChips({
  groups,
  max = 3,
}: {
  groups: { id: number; name: string }[];
  max?: number;
}) {
  if (groups.length === 0) return <span className="text-xs text-muted-foreground">{EMPTY_VALUE}</span>;
  const shown = groups.slice(0, max);
  const extra = groups.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((g) => (
        <Badge
          key={g.id}
          variant="secondary"
          className="max-w-[140px] truncate px-1.5 py-0 text-[11px] font-normal"
          title={g.name}
        >
          {g.name}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
          title={groups.slice(max).map((g) => g.name).join(", ")}
        >
          +{extra}
        </Badge>
      )}
    </div>
  );
}

/**
 * Criar grupo inline (sem sair da lista): botão "Novo grupo" que abre um input
 * curtinho ali do lado; Enter cria, Esc cancela. Usa `createFanGroup` via callback.
 */
function NewGroupInline({ onCreate }: { onCreate: (name: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit() {
    const nome = name.trim();
    if (!nome) return;
    await onCreate(nome);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <FolderPlus className="h-4 w-4" /> Novo grupo
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        ref={inputRef}
        className="h-8 w-44"
        placeholder="Nome do grupo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          else if (e.key === "Escape") { setName(""); setOpen(false); }
        }}
      />
      <Button size="sm" className="h-8" onClick={() => void submit()} disabled={!name.trim()}>
        Criar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8"
        onClick={() => { setName(""); setOpen(false); }}
      >
        Cancelar
      </Button>
    </div>
  );
}

// ── Visão agrupada por grupo (pastas) ────────────────────────────────────────
// Toggle "Agrupar por grupo" LIGADO: uma pasta colapsável por grupo + "Sem grupo".
// Multi-grupo: um fã em N grupos aparece em N pastas. As linhas/cards de fã são
// ARRASTÁVEIS e os cabeçalhos de pasta são DROPÁVEIS — soltar ADICIONA ao grupo
// (não move/remove de outros). "Sem grupo" não é alvo de drop (ignora).

const NO_GROUP_KEY = "__none__";

type FolderBucket = {
  /** id do grupo ("__none__" para a pasta "Sem grupo"). */
  key: string;
  group: { id: number; name: string } | null;
  fans: Fan[];
};

function GroupedFansView({
  fans,
  groups,
  groupMap,
  view,
  interactionCounts,
  perkCounts,
  onOpen,
  onDelete,
  onDropFanOnGroup,
}: {
  fans: Fan[];
  groups: FanGroup[];
  groupMap: Map<number, { id: number; name: string }[]>;
  view: ViewMode;
  interactionCounts: Map<number, number>;
  perkCounts: Map<number, number>;
  onOpen: (f: Fan) => void;
  onDelete: (f: Fan) => void;
  onDropFanOnGroup: (fanId: number, group: { id: number; name: string }) => void;
}) {
  const [activeFanId, setActiveFanId] = useState<number | null>(null);
  // distance:5 → um clique abre o fã; só um arrasto (>5px) inicia o drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Colapso por grupo, persistido em localStorage (preferência da máquina).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("vistage.fans.groupCollapsed");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("vistage.fans.groupCollapsed", JSON.stringify(next));
      } catch {
        /* storage indisponível */
      }
      return next;
    });
  }, []);

  // Monta as pastas: uma por grupo (na ordem de `groups`), cada fã aparece em
  // todas as pastas dos grupos a que pertence; quem não tem grupo cai em "Sem grupo".
  const buckets = useMemo<FolderBucket[]>(() => {
    const byGroup = new Map<number, Fan[]>();
    for (const g of groups) byGroup.set(g.id, []);
    const noGroup: Fan[] = [];
    for (const f of fans) {
      const gs = groupMap.get(f.id) ?? [];
      if (gs.length === 0) {
        noGroup.push(f);
        continue;
      }
      for (const g of gs) {
        const arr = byGroup.get(g.id);
        if (arr) arr.push(f);
        else byGroup.set(g.id, [f]); // grupo fora da lista (defensivo)
      }
    }
    const out: FolderBucket[] = groups.map((g) => ({
      key: String(g.id),
      group: { id: g.id, name: g.name },
      fans: byGroup.get(g.id) ?? [],
    }));
    out.push({ key: NO_GROUP_KEY, group: null, fans: noGroup });
    return out;
  }, [fans, groups, groupMap]);

  const activeFan = activeFanId != null ? fans.find((f) => f.id === activeFanId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveFanId(fanIdFromDragId(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveFanId(null);
    const { active, over } = e;
    if (!over) return;
    const overKey = String(over.id);
    if (overKey === NO_GROUP_KEY) return; // soltar em "Sem grupo" não faz nada
    const bucket = buckets.find((b) => b.key === overKey);
    if (!bucket?.group) return;
    onDropFanOnGroup(fanIdFromDragId(active.id), bucket.group);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveFanId(null)}
    >
      <div className="space-y-3">
        {buckets.map((b) => (
          <GroupFolder
            key={b.key}
            bucket={b}
            collapsed={!!collapsed[b.key]}
            onToggle={() => toggleCollapsed(b.key)}
            view={view}
            interactionCounts={interactionCounts}
            perkCounts={perkCounts}
            groupMap={groupMap}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </div>
      <DragOverlay>
        {activeFan ? (
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm shadow-lg">
            <span className="truncate font-medium">{activeFan.name}</span>
            <LevelBadge level={activeFan.level} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * O id de draggable do dnd-kit é COMPOSTO (`${bucketKey}:${fanId}`) pra ser único
 * quando o MESMO fã aparece em várias pastas (multi-grupo) dentro do mesmo
 * DndContext — ids repetidos dão comportamento indefinido. Extrai o fanId (último
 * segmento; o fanId é numérico, então `.pop()` é seguro mesmo se a key tiver ":").
 */
function fanIdFromDragId(id: string | number): number {
  return Number(String(id).split(":").pop());
}

/** Pasta colapsável (droppable) com os fãs de um grupo (ou "Sem grupo"). */
function GroupFolder({
  bucket,
  collapsed,
  onToggle,
  view,
  interactionCounts,
  perkCounts,
  groupMap,
  onOpen,
  onDelete,
}: {
  bucket: FolderBucket;
  collapsed: boolean;
  onToggle: () => void;
  view: ViewMode;
  interactionCounts: Map<number, number>;
  perkCounts: Map<number, number>;
  groupMap: Map<number, { id: number; name: string }[]>;
  onOpen: (f: Fan) => void;
  onDelete: (f: Fan) => void;
}) {
  const droppable = bucket.group != null; // "Sem grupo" não recebe drop
  const { setNodeRef, isOver } = useDroppable({ id: bucket.key, disabled: !droppable });
  const title = bucket.group ? bucket.group.name : "Sem grupo";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "overflow-hidden rounded-md border transition-colors",
        droppable && isOver ? "border-primary bg-primary/5" : "bg-card"
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{title}</span>
        <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
          {bucket.fans.length}
        </span>
        {droppable && isOver && (
          <span className="ml-auto text-xs text-primary">Soltar para adicionar</span>
        )}
      </button>

      {!collapsed && (
        <div className="border-t p-3">
          {bucket.fans.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              {droppable ? "Arraste fãs para cá." : "Nenhum fã sem grupo."}
            </p>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {bucket.fans.map((f) => (
                <DraggableFan key={f.id} dragId={`${bucket.key}:${f.id}`}>
                  <FanCard
                    fan={f}
                    interactionCount={interactionCounts.get(f.id) ?? 0}
                    perkCount={perkCounts.get(f.id) ?? 0}
                    groups={groupMap.get(f.id) ?? []}
                    onOpen={() => onOpen(f)}
                    onEdit={() => onOpen(f)}
                    onDelete={() => onDelete(f)}
                  />
                </DraggableFan>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {bucket.fans.map((f) => (
                <FanGroupedRow
                  key={f.id}
                  fan={f}
                  dragId={`${bucket.key}:${f.id}`}
                  interactionCount={interactionCounts.get(f.id) ?? 0}
                  groups={groupMap.get(f.id) ?? []}
                  onOpen={() => onOpen(f)}
                  onDelete={() => onDelete(f)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Wrapper arrastável (dnd-kit) para o card de fã na visão de pastas. */
function DraggableFan({ dragId, children }: { dragId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
}

/** Linha compacta e ARRASTÁVEL de fã na visão de pastas (modo lista). */
function FanGroupedRow({
  fan: f,
  dragId,
  interactionCount,
  groups,
  onOpen,
  onDelete,
}: {
  fan: Fan;
  dragId: string;
  interactionCount: number;
  groups: { id: number; name: string }[];
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  const last = f.last_interaction_at;
  const daysAgo = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "group flex cursor-grab touch-none items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-sm transition-colors hover:bg-muted/40 active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <div className="min-w-0 flex-1">
        <FanListAvatar fan={f} />
      </div>
      <span className="hidden shrink-0 sm:block">
        <LevelBadge level={f.level} />
      </span>
      <span className="hidden min-w-0 max-w-[40%] shrink md:block">
        <FanGroupChips groups={groups} max={2} />
      </span>
      <span className="hidden w-24 shrink-0 text-xs text-muted-foreground lg:block">
        {f.city ?? EMPTY_VALUE}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground lg:block">
        {interactionCount > 0 ? `${interactionCount} int.` : EMPTY_VALUE}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground xl:block">
        {daysAgo == null ? EMPTY_VALUE : daysAgo === 0 ? "hoje" : daysAgo === 1 ? "ontem" : `${daysAgo}d`}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 opacity-0 transition group-hover:opacity-100"
        aria-label="Excluir"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}

function FanGroupsPanel({ fans, embedded = false }: { fans: Fan[]; embedded?: boolean }) {
  const [open, setOpen] = useState(embedded);
  const [groups, setGroups] = useState<FanGroup[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, FanGroupMember[]>>({});
  const [newName, setNewName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newOrigin, setNewOrigin] = useState("");
  const [adding, setAdding] = useState(false);
  const [memberInput, setMemberInput] = useState<Record<number, { fanId: string; name: string }>>({});
  const [stats, setStats] = useState<Map<number, { members: number; interactions: number }>>(new Map());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; whatsapp: string; origin: string }>({ name: "", whatsapp: "", origin: "" });

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  async function refresh() {
    const [gs, st] = await Promise.all([listFanGroups(), listFanGroupStats()]);
    setGroups(gs);
    setStats(st);
  }

  function startEdit(g: FanGroup) {
    setEditingId(g.id);
    setEditForm({ name: g.name, whatsapp: g.whatsapp_group ?? "", origin: g.origin ?? "" });
  }

  async function saveEdit() {
    if (editingId == null || !editForm.name.trim()) return;
    await updateFanGroup({
      id: editingId,
      name: editForm.name.trim(),
      whatsapp_group: editForm.whatsapp || null,
      origin: editForm.origin || null,
    });
    setEditingId(null);
    await refresh();
  }

  async function expand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    const m = await listFanGroupMembers(id);
    setMembers((prev) => ({ ...prev, [id]: m }));
  }

  async function handleAddGroup() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await createFanGroup({ name: newName.trim(), whatsapp_group: newWhatsapp || null, origin: newOrigin || null, notes: null });
      setNewName(""); setNewWhatsapp(""); setNewOrigin("");
      await refresh();
      toast.success("Grupo criado");
    } finally { setAdding(false); }
  }

  async function handleDeleteGroup(id: number) {
    const ok = await confirmDialog({
      title: "Excluir grupo",
      description: "Remove o grupo e desfaz o vínculo dos fãs a ele (os fãs não são apagados).",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteFanGroup(id);
    if (expandedId === id) setExpandedId(null);
    await refresh();
  }

  async function handleAddMember(groupId: number) {
    const inp = memberInput[groupId];
    const fanId = inp?.fanId ? Number(inp.fanId) : null;
    const name = inp?.name?.trim() || null;
    if (!fanId && !name) return;
    await addFanGroupMember(groupId, fanId, name, null);
    const m = await listFanGroupMembers(groupId);
    setMembers((prev) => ({ ...prev, [groupId]: m }));
    setMemberInput((prev) => ({ ...prev, [groupId]: { fanId: "", name: "" } }));
  }

  async function handleRemoveMember(groupId: number, memberId: number) {
    const member = members[groupId]?.find((x) => x.id === memberId);
    const reloadMembers = async () => {
      const m = await listFanGroupMembers(groupId);
      setMembers((prev) => ({ ...prev, [groupId]: m }));
    };
    if (!member) {
      await removeFanGroupMember(memberId);
      await reloadMembers();
      return;
    }
    await deleteWithUndo({
      label: "Membro do grupo",
      remove: () => removeFanGroupMember(memberId),
      restore: async () => {
        await addFanGroupMember(groupId, member.fan_id, member.name, member.notes);
      },
      onChange: reloadMembers,
    });
  }

  return (
    <div className={embedded ? "" : "rounded-md border"}>
      {!embedded && (
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          onClick={() => setOpen((v) => !v)}
        >
          <span>Grupos de Fãs</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}

      {(embedded || open) && (
        <div className={embedded ? "space-y-4" : "border-t p-4 space-y-4"}>
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const st = stats.get(g.id);
            return (
            <div key={g.id} className="rounded-md border">
              {editingId === g.id ? (
                <div className="space-y-2 p-3">
                  <Input className="h-8 text-sm" placeholder="Nome do grupo *" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <Input className="h-8 text-sm" placeholder="Link do grupo" value={editForm.whatsapp} onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))} />
                  <Input className="h-8 text-sm" placeholder="Origem" value={editForm.origin} onChange={(e) => setEditForm((f) => ({ ...f, origin: e.target.value }))} />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingId(null)}>Cancelar</Button>
                    <Button size="sm" className="h-7" onClick={() => void saveEdit()} disabled={!editForm.name.trim()}>Salvar</Button>
                  </div>
                </div>
              ) : (
              <div className="flex items-center justify-between gap-1 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
                  onClick={() => void expand(g.id)}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {st?.members ?? 0} pess. · {st?.interactions ?? 0} inter.
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => startEdit(g)}
                    aria-label="Editar grupo"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => void handleDeleteGroup(g.id)}
                    aria-label="Excluir grupo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              )}
              {expandedId === g.id && editingId !== g.id && (
                <div className="border-t px-3 py-3 space-y-2">
                  {(g.origin || g.whatsapp_group) && (
                    <div className="text-xs text-muted-foreground">
                      {g.origin && <span>Origem: {g.origin}</span>}
                      {g.origin && g.whatsapp_group && <span> · </span>}
                      {g.whatsapp_group && <span>{g.whatsapp_group}</span>}
                    </div>
                  )}
                  {(members[g.id] ?? []).map((m) => {
                    const fanName = m.fan_id ? fans.find((f) => f.id === m.fan_id)?.name : null;
                    return (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <span>{fanName ?? m.name ?? EMPTY_VALUE}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => void handleRemoveMember(g.id, m.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 pt-1">
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs flex-1"
                      value={memberInput[g.id]?.fanId ?? ""}
                      onChange={(e) => setMemberInput((prev) => ({ ...prev, [g.id]: { ...prev[g.id], fanId: e.target.value, name: prev[g.id]?.name ?? "" } }))}
                    >
                      <option value="">Selecionar fã…</option>
                      {fans.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="Ou nome livre"
                      value={memberInput[g.id]?.name ?? ""}
                      onChange={(e) => setMemberInput((prev) => ({ ...prev, [g.id]: { ...prev[g.id], name: e.target.value, fanId: prev[g.id]?.fanId ?? "" } }))}
                    />
                    <Button size="sm" className="h-8" onClick={() => void handleAddMember(g.id)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Novo grupo</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="Nome do grupo *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="Link do grupo, se houver"
                value={newWhatsapp}
                onChange={(e) => setNewWhatsapp(e.target.value)}
              />
              <Input
                placeholder="Origem"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void handleAddGroup()} disabled={adding}>
                <Plus className="h-3.5 w-3.5" /> Criar grupo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
