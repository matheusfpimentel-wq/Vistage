import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Crown,
  Flame,
  Heart,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  Trash2,
  User,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { LevelBadge } from "./components/LevelBadge";
import { FanForm } from "./forms/FanForm";
import { FanDetail } from "./forms/FanDetail";
import {
  addFanGroupMember,
  createFanGroup,
  deleteFan,
  deleteFanGroup,
  getFan,
  getFanStats,
  listFanGroupMembers,
  listFanGroups,
  listFanInteractionCounts,
  listFans,
  loadFanUpgradeRules,
  removeFanGroupMember,
  saveFanUpgradeRules,
  topFansByPresence,
  type FanFilters,
  type FanStats,
} from "./api";
import { FAN_LEVELS, type Fan, type FanGroup, type FanGroupMember, type FanLevel, type FanUpgradeRules } from "./types";
import { formatDate } from "@/lib/format";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { useImageUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type LevelFilter = FanLevel | "Todos";
type ViewMode = "cards" | "list";
type FanSortKey = "name" | "level" | "city" | "last_interaction_at" | "interactions";
type SortDir = "asc" | "desc";
const LEVEL_ORDER: Record<FanLevel, number> = { "Possível fã": 0, "Quase fã": 1, "Fã": 2, "Superfã": 3, "Embaixador": 4 };

export function FansPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fans, setFans] = useState<Fan[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FanStats | null>(null);
  const [topPresence, setTopPresence] = useState<
    { fan_id: number; name: string; gigs: number }[]
  >([]);
  const [interactionCounts, setInteractionCounts] = useState<Map<number, number>>(new Map());
  const [filters, setFilters] = useState<{
    level: LevelFilter;
    city: string;
    search: string;
  }>({ level: "Todos", city: "", search: "" });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fan | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [upgradeRulesOpen, setUpgradeRulesOpen] = useState(false);
  const [sortKey, setSortKey] = useState<FanSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: FanSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sortedFans = useMemo(() => {
    return [...fans].sort((a, b) => {
      if (sortKey === "level") {
        const diff = (LEVEL_ORDER[a.level] ?? 0) - (LEVEL_ORDER[b.level] ?? 0);
        return sortDir === "asc" ? diff : -diff;
      }
      if (sortKey === "interactions") {
        const diff = (interactionCounts.get(a.id) ?? 0) - (interactionCounts.get(b.id) ?? 0);
        return sortDir === "asc" ? diff : -diff;
      }
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return sortDir === "asc"
        ? av.localeCompare(bv, "pt-BR")
        : bv.localeCompare(av, "pt-BR");
    });
  }, [fans, sortKey, sortDir, interactionCounts]);

  function FanSortIcon({ col }: { col: FanSortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  const queryFilters: FanFilters = useMemo(
    () => ({
      level: filters.level,
      city: filters.city,
      search: filters.search,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, s, top, counts] = await Promise.all([
        listFans(queryFilters),
        getFanStats(),
        topFansByPresence(5).catch(() => []),
        listFanInteractionCounts().catch(() => new Map<number, number>()),
      ]);
      setFans(data);
      setStats(s);
      setTopPresence(top ?? []);
      setInteractionCounts(counts);
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

  function openEdit(f: Fan) {
    setEditing(f);
    setFormOpen(true);
  }

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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<Crown className="h-4 w-4 text-amber-500" />}
          label="Embaixadores"
          value={stats?.embaixador ?? 0}
        />
        <StatCard
          icon={<Flame className="h-4 w-4 text-emerald-500" />}
          label="Superfãs"
          value={stats?.superfa ?? 0}
        />
        <StatCard
          icon={<Heart className="h-4 w-4 text-sky-400" />}
          label="Fãs"
          value={stats?.fa ?? 0}
        />
        <StatCard
          icon={<UserPlus className="h-4 w-4 text-violet-400" />}
          label="Quase fãs"
          value={stats?.quaseFa ?? 0}
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
          label="Possíveis fãs"
          value={stats?.possivelFa ?? 0}
        />
      </div>

      {topPresence.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Heart className="h-4 w-4 text-red-400" />
              Fãs mais presentes em shows
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {topPresence.map((t) => (
              <span
                key={t.fan_id}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">🎤 {t.gigs} shows</span>
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="sticky top-0 z-10 bg-background pt-1 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, @, email, telefone…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-72 pl-8"
            />
          </div>
          <Select
            value={filters.level}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, level: v as LevelFilter }))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os níveis</SelectItem>
              {FAN_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Cidade"
            value={filters.city}
            onChange={(e) =>
              setFilters((f) => ({ ...f, city: e.target.value }))
            }
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            <button
              onClick={() => setView("cards")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "cards" ? "bg-background shadow-sm" : "text-muted-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "list" ? "bg-background shadow-sm" : "text-muted-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
          <Button variant="outline" size="icon" aria-label="Configurar upgrade automático" onClick={() => setUpgradeRulesOpen(true)}>
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo fã
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Carregando…</div>
      ) : fans.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nenhum fã cadastrado ainda."
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {fans.map((f) => (
            <FanCard
              key={f.id}
              fan={f}
              interactionCount={interactionCounts.get(f.id) ?? 0}
              onOpen={() => openDetail(f)}
              onEdit={() => openEdit(f)}
              onDelete={() => void handleDelete(f)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground">
              <tr>
                {(["name", "level", "city"] as const).map((col, i) => (
                  <th key={col} className="px-3 py-2 text-left">
                    <button type="button" onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-foreground">
                      {["Nome", "Nível", "Cidade"][i]}
                      <FanSortIcon col={col} />
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-left">Contato</th>
                <th className="px-3 py-2 text-left">
                  <button type="button" onClick={() => toggleSort("last_interaction_at")} className="flex items-center gap-1 hover:text-foreground">
                    Último contato <FanSortIcon col="last_interaction_at" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left">
                  <button type="button" onClick={() => toggleSort("interactions")} className="flex items-center gap-1 hover:text-foreground">
                    Interações <FanSortIcon col="interactions" />
                  </button>
                </th>
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
                          onClick={() => openEdit(f)}
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
        onEdit={(f) => {
          setDetailOpen(false);
          openEdit(f);
        }}
      />

      <FanGroupsPanel fans={fans} />

      <FanUpgradeRulesDialog open={upgradeRulesOpen} onOpenChange={setUpgradeRulesOpen} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
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
  onOpen,
  onEdit,
  onDelete,
}: {
  fan: Fan;
  interactionCount: number;
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
        <LevelBadge level={f.level} />
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

function FanGroupsPanel({ fans }: { fans: Fan[] }) {
  const [open, setOpen] = useState(false);
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
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Grupos de Fãs</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t p-4 space-y-4">
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

type CriteriaState = {
  minInteractions: string;
  minPresences: string;
  minFeedbacks: string;
  minDaysSinceCreation: string;
};

const emptyCriteria = (): CriteriaState => ({
  minInteractions: "",
  minPresences: "",
  minFeedbacks: "",
  minDaysSinceCreation: "",
});

function parseCriteria(s: CriteriaState) {
  const result: import("./types").FanLevelCriteria = {};
  if (s.minInteractions.trim()) result.minInteractions = Number(s.minInteractions);
  if (s.minPresences.trim()) result.minPresences = Number(s.minPresences);
  if (s.minFeedbacks.trim()) result.minFeedbacks = Number(s.minFeedbacks);
  if (s.minDaysSinceCreation.trim()) result.minDaysSinceCreation = Number(s.minDaysSinceCreation);
  return Object.keys(result).length ? result : undefined;
}

function criteriaFromRules(c?: import("./types").FanLevelCriteria): CriteriaState {
  return {
    minInteractions: c?.minInteractions != null ? String(c.minInteractions) : "",
    minPresences: c?.minPresences != null ? String(c.minPresences) : "",
    minFeedbacks: c?.minFeedbacks != null ? String(c.minFeedbacks) : "",
    minDaysSinceCreation: c?.minDaysSinceCreation != null ? String(c.minDaysSinceCreation) : "",
  };
}

function CriteriaFields({
  state,
  onChange,
}: {
  state: CriteriaState;
  onChange: (s: CriteriaState) => void;
}) {
  function set(key: keyof CriteriaState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...state, [key]: e.target.value });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-sm font-medium">Mínimo de interações totais</label>
        <Input type="number" min={1} placeholder="Deixe vazio para ignorar" value={state.minInteractions} onChange={set("minInteractions")} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Mínimo de presenças</label>
        <Input type="number" min={1} placeholder="Deixe vazio para ignorar" value={state.minPresences} onChange={set("minPresences")} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Mínimo de feedbacks</label>
        <Input type="number" min={1} placeholder="Deixe vazio para ignorar" value={state.minFeedbacks} onChange={set("minFeedbacks")} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Dias mínimos como cadastrado</label>
        <Input type="number" min={1} placeholder="Deixe vazio para ignorar" value={state.minDaysSinceCreation} onChange={set("minDaysSinceCreation")} />
      </div>
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
  const [toFa, setToFa] = useState<CriteriaState>(emptyCriteria());
  const [toSuperfa, setToSuperfa] = useState<CriteriaState>(emptyCriteria());
  const [downgradeInactiveDays, setDowngradeInactiveDays] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadFanUpgradeRules().then((r: FanUpgradeRules) => {
      setToFa(criteriaFromRules(r.toFa));
      setToSuperfa(criteriaFromRules(r.toSuperfa));
      setDowngradeInactiveDays(r.downgradeInactiveDays != null ? String(r.downgradeInactiveDays) : "");
    });
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      const rules: FanUpgradeRules = {
        toFa: parseCriteria(toFa),
        toSuperfa: parseCriteria(toSuperfa),
        downgradeInactiveDays: downgradeInactiveDays.trim() ? Number(downgradeInactiveDays) : null,
      };
      await saveFanUpgradeRules(rules);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upgrade automático de fãs</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold">Critérios para Fã <span className="font-normal text-muted-foreground">(Possível fã → Fã)</span></div>
            <CriteriaFields state={toFa} onChange={setToFa} />
          </div>
          <div className="space-y-3">
            <div className="text-sm font-semibold">Critérios para Superfã <span className="font-normal text-muted-foreground">(Fã → Superfã)</span></div>
            <CriteriaFields state={toSuperfa} onChange={setToSuperfa} />
          </div>
          <div className="space-y-3">
            <div className="text-sm font-semibold">Rebaixamento automático</div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Rebaixar após X dias sem interação</label>
              <Input
                type="number"
                min={1}
                placeholder="Deixe vazio para desativar"
                value={downgradeInactiveDays}
                onChange={(e) => setDowngradeInactiveDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Deixe vazio para ignorar este critério.</p>
            </div>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
