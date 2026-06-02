import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Flame,
  Heart,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
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
  deleteFan,
  getFanStats,
  listFans,
  type FanFilters,
  type FanStats,
} from "./api";
import { FAN_LEVELS, type Fan, type FanLevel } from "./types";
import { formatDate } from "@/lib/format";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { useImageUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type LevelFilter = FanLevel | "Todos";
type ViewMode = "cards" | "list";

export function FansPage() {
  const [fans, setFans] = useState<Fan[]>([]);
  const [stats, setStats] = useState<FanStats | null>(null);
  const [filters, setFilters] = useState<{
    level: LevelFilter;
    city: string;
    search: string;
  }>({ level: "Todos", city: "", search: "" });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fan | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("cards");

  const queryFilters: FanFilters = useMemo(
    () => ({
      level: filters.level,
      city: filters.city,
      search: filters.search,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const [data, s] = await Promise.all([listFans(queryFilters), getFanStats()]);
    setFans(data);
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
      <div className="grid gap-3 sm:grid-cols-3">
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
          icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
          label="Possíveis fãs"
          value={stats?.possivelFa ?? 0}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
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
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo fã
          </Button>
        </div>
      </div>

      {fans.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Heart className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum fã cadastrado ainda.
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {fans.map((f) => (
            <FanCard key={f.id} fan={f} onOpen={() => openDetail(f)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Nível</th>
                <th className="px-3 py-2 text-left">Cidade</th>
                <th className="px-3 py-2 text-left">Contato</th>
                <th className="px-3 py-2 text-left">Último contato</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {fans.map((f) => {
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

function FanCard({ fan: f, onOpen }: { fan: Fan; onOpen: () => void }) {
  const photoUrl = useImageUrl(f.photo_path);
  const last = f.last_interaction_at;
  const daysAgo = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : null;
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary hover:shadow-md"
    >
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
      </div>
    </button>
  );
}
