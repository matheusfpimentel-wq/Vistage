import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Gift,
  Heart,
  LayoutGrid,
  List,
  Megaphone,
  Pencil,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  User,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonCards } from "@/components/shared/Skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { FanClubConfigDialog } from "./components/FanClubConfigDialog";
import { FanTodayView } from "./components/FanTodayView";
import {
  addFanGroupMember,
  createFanGroup,
  deleteFan,
  deleteFanGroup,
  deleteFanSegment,
  getFan,
  listFanGroupMembers,
  listFanGroups,
  listFanInteractionCounts,
  listFanPerkCounts,
  listFans,
  listFanOrigens,
  listFanSegments,
  createFanSegment,
  loadFanUpgradeRules,
  parseFanSegmentCriterios,
  recomputeAllFanLevels,
  removeFanGroupMember,
  saveFanUpgradeRules,
  type FanFilters,
} from "./api";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { FAN_LEVELS, type Fan, type FanGroup, type FanGroupMember, type FanLevel, type FanScoreThresholds, type FanScoringConfig, type FanSegment, type FanUpgradeRules } from "./types";
import { formatDate } from "@/lib/format";
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

export function FansPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fans, setFans] = useState<Fan[]>([]);
  const [loading, setLoading] = useState(true);
  const [interactionCounts, setInteractionCounts] = useState<Map<number, number>>(new Map());
  const [perkCounts, setPerkCounts] = useState<Map<number, number>>(new Map());
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
  // "Próximas ações" (valor "hoje") é a aba PADRÃO do Clube de Fãs.
  const [section, setSection] = useState<"fas" | "hoje" | "grupos" | "config">("hoje");
  const [upgradeRulesOpen, setUpgradeRulesOpen] = useState(false);
  const [clubConfigOpen, setClubConfigOpen] = useState(false);
  const { sorted: sortedFans, sortKey, sortDir, handleSort } = useTableSort(fans);
  const cols = useResizableColumns("fans", [
    { id: "name", width: 240, min: 140 },
    { id: "level", width: 120 },
    { id: "city", width: 150 },
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
      const [data, counts, perks] = await Promise.all([
        listFans(queryFilters),
        listFanInteractionCounts().catch(() => new Map<number, number>()),
        listFanPerkCounts().catch(() => new Map<number, number>()),
      ]);
      setFans(data);
      setInteractionCounts(counts);
      setPerkCounts(perks);
    } catch (e) {
      toast.error(`Erro ao carregar fãs: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

      {loading ? (
        <SkeletonCards />
      ) : fans.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={filters.search || filters.level !== "Todos" || filters.city.trim() ? "Nenhum fã com esses filtros." : "Comece seu Clube de Fãs."}
          description={
            filters.search || filters.level !== "Todos" || filters.city.trim()
              ? "Ajuste a busca ou os filtros."
              : "Cadastre quem acompanha seu trabalho. O nível de cada um cresce com presença, interação e feedback — e decai sozinho com o tempo."
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo fã
            </Button>
          }
        />
      ) : view === "cards" ? (
        <PendingTasksProvider entityType="fan">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {fans.map((f) => (
            <FanCard
              key={f.id}
              fan={f}
              interactionCount={interactionCounts.get(f.id) ?? 0}
              perkCount={perkCounts.get(f.id) ?? 0}
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
                <SortableHeader<Fan> col="name" label="Nome" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("name")} />
                </SortableHeader>
                <SortableHeader<Fan> col="level" label="Nível" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("level")} />
                </SortableHeader>
                <SortableHeader<Fan> col="city" label="Cidade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("city")} />
                </SortableHeader>
                <th className="relative px-3 py-2 text-left">Contato<ColResizer {...cols.resizer("contact")} /></th>
                <SortableHeader<Fan> col="last_interaction_at" label="Último contato" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left">
                  <ColResizer {...cols.resizer("last")} />
                </SortableHeader>
                <th className="relative px-3 py-2 text-left">Interações<ColResizer {...cols.resizer("interactions")} /></th>
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
                      {f.city ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {f.instagram ?? f.email ?? f.phone ?? "—"}
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
                        <span className="text-xs text-muted-foreground">—</span>
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
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Grupos (comunidades externas)</h3>
            <FanGroupsPanel fans={fans} embedded />
          </div>
        </TabsContent>

        <TabsContent value="config">
          <FanClubConfigSurface
            onEditScoring={() => setUpgradeRulesOpen(true)}
            onEditActions={() => setClubConfigOpen(true)}
          />
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

      <FanUpgradeRulesDialog open={upgradeRulesOpen} onOpenChange={setUpgradeRulesOpen} />

      <FanClubConfigDialog open={clubConfigOpen} onOpenChange={setClubConfigOpen} />
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

// Aba "Configurar clube" — consolida num lugar só os ajustes que antes ficavam
// soltos na barra: pontuação/níveis e ações rápidas + catálogo de perks. Cada
// cartão abre o editor correspondente.
function FanClubConfigSurface({
  onEditScoring,
  onEditActions,
}: {
  onEditScoring: () => void;
  onEditActions: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={onEditScoring}
        className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition hover:border-primary hover:shadow-sm"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Settings2 className="h-4 w-4" />
        </span>
        <span className="font-medium">Pontuação e níveis</span>
        <span className="text-xs text-muted-foreground">
          Pesos de cada sinal, decaimento (meia-vida) e limiares de nível. Recalcular todos os fãs.
        </span>
      </button>

      <button
        type="button"
        onClick={onEditActions}
        className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition hover:border-primary hover:shadow-sm"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Megaphone className="h-4 w-4" />
        </span>
        <span className="font-medium">Ações rápidas e perks</span>
        <span className="text-xs text-muted-foreground">
          Botões que viram tarefa ({"{nome}"}) e o catálogo de perks/brindes de um clique.
        </span>
      </button>
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
  onOpen,
  onEdit,
  onDelete,
}: {
  fan: Fan;
  interactionCount: number;
  perkCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const photoUrl = useImageUrl(f.photo_path);
  const last = f.last_interaction_at;
  const daysAgo = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary hover:shadow-md"
    >
      {/* ações no hover */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-sm"
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
          className="h-7 w-7 shadow-sm"
          aria-label="Excluir"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      <div className="h-28 w-full bg-muted">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={f.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <User className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="font-medium leading-tight">{f.name}</div>
        <div className="flex flex-wrap items-center gap-1">
          <LevelBadge level={f.level} />
          <PendingTasksBadge entityType="fan" entityId={f.id} />
          {perkCount > 0 && (
            <Badge variant="secondary" className="gap-1" title={`${perkCount} perk(s)/brinde(s)`}>
              <Gift className="h-3 w-3" />
              {perkCount}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{f.city ?? "—"}</div>
        {last && (
          <div className="text-[11px] text-muted-foreground">
            Último contato:{" "}
            {daysAgo === 0 ? "hoje" : daysAgo === 1 ? "ontem" : `há ${daysAgo}d`}
          </div>
        )}
        {interactionCount > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {interactionCount} interaç{interactionCount === 1 ? "ão" : "ões"}
          </div>
        )}
      </div>
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

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  async function refresh() {
    const gs = await listFanGroups();
    setGroups(gs);
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
    await removeFanGroupMember(memberId);
    const m = await listFanGroupMembers(groupId);
    setMembers((prev) => ({ ...prev, [groupId]: m }));
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
          {groups.map((g) => (
            <div key={g.id} className="rounded-md border">
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  type="button"
                  className="flex-1 text-left text-sm font-medium"
                  onClick={() => void expand(g.id)}
                >
                  {g.name}
                  {g.origin && <span className="ml-2 text-xs text-muted-foreground">({g.origin})</span>}
                  {g.whatsapp_group && <span className="ml-2 text-xs text-muted-foreground">· {g.whatsapp_group}</span>}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => void handleDeleteGroup(g.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {expandedId === g.id && (
                <div className="border-t px-3 py-3 space-y-2">
                  {(members[g.id] ?? []).map((m) => {
                    const fanName = m.fan_id ? fans.find((f) => f.id === m.fan_id)?.name : null;
                    return (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <span>{fanName ?? m.name ?? "—"}</span>
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
          ))}

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

type ScoringState = {
  weightPresenca: string;
  weightFeedback: string;
  weightInteracao: string;
  weightGig: string;
  weightCompra: string;
  weightIndicacao: string;
  halfLifeDays: string;
  thQuaseFa: string;
  thFa: string;
  thSuperfa: string;
  thEmbaixador: string;
};

const emptyScoring = (): ScoringState => ({
  weightPresenca: "",
  weightFeedback: "",
  weightInteracao: "",
  weightGig: "",
  weightCompra: "",
  weightIndicacao: "",
  halfLifeDays: "",
  thQuaseFa: "",
  thFa: "",
  thSuperfa: "",
  thEmbaixador: "",
});

function scoringToState(s?: FanScoringConfig): ScoringState {
  const v = (n?: number) => (n != null ? String(n) : "");
  return {
    weightPresenca: v(s?.weightPresenca),
    weightFeedback: v(s?.weightFeedback),
    weightInteracao: v(s?.weightInteracao),
    weightGig: v(s?.weightGig),
    weightCompra: v(s?.weightCompra),
    weightIndicacao: v(s?.weightIndicacao),
    halfLifeDays: v(s?.halfLifeDays),
    thQuaseFa: v(s?.thresholds?.quaseFa),
    thFa: v(s?.thresholds?.fa),
    thSuperfa: v(s?.thresholds?.superfa),
    thEmbaixador: v(s?.thresholds?.embaixador),
  };
}

function stateToScoring(s: ScoringState): FanScoringConfig {
  const num = (x: string): number | undefined => {
    const t = x.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  const scoring: FanScoringConfig = {};
  const wp = num(s.weightPresenca); if (wp != null) scoring.weightPresenca = wp;
  const wf = num(s.weightFeedback); if (wf != null) scoring.weightFeedback = wf;
  const wi = num(s.weightInteracao); if (wi != null) scoring.weightInteracao = wi;
  const wg = num(s.weightGig); if (wg != null) scoring.weightGig = wg;
  const wc = num(s.weightCompra); if (wc != null) scoring.weightCompra = wc;
  const wid = num(s.weightIndicacao); if (wid != null) scoring.weightIndicacao = wid;
  const hl = num(s.halfLifeDays); if (hl != null) scoring.halfLifeDays = hl;
  const thresholds: FanScoreThresholds = {};
  const tq = num(s.thQuaseFa); if (tq != null) thresholds.quaseFa = tq;
  const tf = num(s.thFa); if (tf != null) thresholds.fa = tf;
  const ts = num(s.thSuperfa); if (ts != null) thresholds.superfa = ts;
  const te = num(s.thEmbaixador); if (te != null) thresholds.embaixador = te;
  if (Object.keys(thresholds).length) scoring.thresholds = thresholds;
  return scoring;
}

function ScoreField({
  label,
  value,
  placeholder,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <Input
        type="number"
        min={0}
        placeholder={`padrão: ${placeholder}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FanUpgradeRulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [s, setS] = useState<ScoringState>(emptyScoring());
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadFanUpgradeRules().then((r: FanUpgradeRules) => setS(scoringToState(r.scoring)));
  }, [open]);

  const set = (key: keyof ScoringState) => (v: string) =>
    setS((prev) => ({ ...prev, [key]: v }));

  async function persist(): Promise<void> {
    const current = await loadFanUpgradeRules();
    await saveFanUpgradeRules({ ...current, scoring: stateToScoring(s) });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await persist();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalc() {
    setRecalcing(true);
    try {
      await persist(); // recalcula já com os pesos atuais da tela
      const changed = await recomputeAllFanLevels();
      toast.success(changed > 0 ? `${changed} nível(is) atualizado(s)` : "Nenhum nível mudou");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setRecalcing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pontuação de engajamento dos fãs</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <p className="text-xs text-muted-foreground">
            O nível de cada fã é calculado por uma pontuação que decai com o
            tempo: cada sinal vale pontos e perde peso conforme envelhece. Campos
            vazios usam o padrão.
          </p>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Pesos por sinal</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreField label="Presença em evento (manual)" value={s.weightPresenca} placeholder="3" onChange={set("weightPresenca")} />
              <ScoreField label="Feedback" value={s.weightFeedback} placeholder="2" onChange={set("weightFeedback")} />
              <ScoreField label="Interação" value={s.weightInteracao} placeholder="1" onChange={set("weightInteracao")} />
              <ScoreField label="Presença em evento (GIG)" value={s.weightGig} placeholder="3" onChange={set("weightGig")} />
              <ScoreField label="Compra (ingresso/merch)" value={s.weightCompra} placeholder="4" onChange={set("weightCompra")} />
              <ScoreField label="Indicação (trouxe alguém)" value={s.weightIndicacao} placeholder="3" onChange={set("weightIndicacao")} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Decaimento</div>
            <ScoreField
              label="Meia-vida (dias)"
              value={s.halfLifeDays}
              placeholder="180"
              onChange={set("halfLifeDays")}
              hint="Um sinal com essa idade vale metade dos pontos."
            />
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Limiares (pontos para cada nível)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreField label="Quase fã" value={s.thQuaseFa} placeholder="2" onChange={set("thQuaseFa")} />
              <ScoreField label="Fã" value={s.thFa} placeholder="5" onChange={set("thFa")} />
              <ScoreField label="Superfã" value={s.thSuperfa} placeholder="12" onChange={set("thSuperfa")} />
            </div>
            <p className="text-xs text-muted-foreground">
              Embaixador não entra na pontuação — é um destaque manual no cadastro do fã.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleRecalc} disabled={recalcing || saving}>
              {recalcing ? "Recalculando…" : "Recalcular todos agora"}
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || recalcing}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
