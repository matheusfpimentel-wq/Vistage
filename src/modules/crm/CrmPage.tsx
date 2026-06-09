import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronsUpDown, LayoutGrid, List, Pencil, Plus, Search, Star, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { EmptyState } from "@/components/shared/EmptyState";
import { TypeBadges } from "./components/TypeBadges";
import { ContactForm } from "./forms/ContactForm";
import { ContactDetail } from "./forms/ContactDetail";
import {
  deleteContact,
  getContact,
  listContacts,
  type ContactFilters,
} from "./api";
import { CONTACT_TYPES, ratingToPriority, type Contact, type ContactType } from "./types";
import { confirmDialog } from "@/components/ui/confirm";
import { GigForm } from "@/modules/gigs/forms/GigForm";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { formatDate } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type TypeFilter = ContactType | "Todos";
type ViewMode = "cards" | "list";
type SortKey = "nome" | "tipo" | "cidade" | "ultimo_contato" | "prioridade";
type SortDir = "asc" | "desc";

function priorityWeight(rating: number | null): number {
  if (rating === null) return -1;
  if (rating >= 4) return 2;
  if (rating >= 2) return 1;
  return 0;
}

export function CrmPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{
    type: TypeFilter;
    city: string;
    search: string;
  }>({ type: "Todos", city: "", search: "" });
  const [sortKey, setSortKey] = useState<SortKey>("prioridade");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [gigFormOpen, setGigFormOpen] = useState(false);
  const [gigPromoter, setGigPromoter] = useState<Contact | null>(null);
  const [view, setView] = useState<ViewMode>("cards");

  const queryFilters: ContactFilters = useMemo(
    () => ({
      type: filters.type,
      city: filters.city,
      search: filters.search,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listContacts(queryFilters);
      setContacts(data);
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
    void getContact(id).then((contact) => {
      if (contact) {
        setDetailId(contact.id);
        setDetailOpen(true);
      }
    });
    setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...contacts].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "nome") cmp = a.name.localeCompare(b.name, "pt");
      else if (sortKey === "tipo") cmp = (a.types[0] ?? "").localeCompare(b.types[0] ?? "", "pt");
      else if (sortKey === "cidade") cmp = (a.city ?? "").localeCompare(b.city ?? "", "pt");
      else if (sortKey === "ultimo_contato") {
        const at = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
        const bt = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : 0;
        cmp = at - bt;
      } else if (sortKey === "prioridade") {
        cmp = priorityWeight(a.rating) - priorityWeight(b.rating);
      }
      return cmp * dir;
    });
  }, [contacts, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(contact: Contact) {
    setEditing(contact);
    setFormOpen(true);
  }

  function openDetail(contact: Contact) {
    setDetailId(contact.id);
    setDetailOpen(true);
  }

  async function handleDelete(c: Contact) {
    const ok = await confirmDialog({
      title: "Excluir",
      description: `Excluir "${c.name}"? GIGs vinculadas perderão a referência ao promoter.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteContact(c.id);
      toast.success("Contato excluído");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  function startGigWithContact(contact: Contact) {
    setGigPromoter(contact);
    setDetailOpen(false);
    setGigFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 bg-background pt-1 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, telefone, @…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-full pl-8 sm:w-72"
            />
          </div>
          <Select
            value={filters.type}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, type: v as TypeFilter }))
            }
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os tipos</SelectItem>
              {CONTACT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
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
            className="w-full sm:w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            <button
              onClick={() => setView("cards")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "cards"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
                view === "list"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo contato
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Carregando…</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum contato encontrado" description="Adicione um novo contato ou ajuste os filtros." />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onOpen={() => openDetail(c)}
              onEdit={() => openEdit(c)}
              onDelete={() => void handleDelete(c)}
            />
          ))}
        </div>
      ) : (
        // No mobile, cai nos cards mesmo quando a view preferida é "lista".
        <>
        <div className="grid grid-cols-1 gap-3 sm:hidden">
          {sorted.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onOpen={() => openDetail(c)}
              onEdit={() => openEdit(c)}
              onDelete={() => void handleDelete(c)}
            />
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-md border sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {(["nome", "tipo", "cidade", "ultimo_contato", "prioridade"] as SortKey[]).map((key) => {
                  const labels: Record<SortKey, string> = { nome: "Nome", tipo: "Tipo", cidade: "Cidade", ultimo_contato: "Último contato", prioridade: "Prioridade" };
                  const Icon = sortKey === key ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  return (
                    <th key={key} className="px-3 py-2 text-left">
                      <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        {labels[key]}<Icon className="h-3 w-3" />
                      </button>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left">Contato</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const last = c.last_interaction_at;
                const daysAgo = last
                  ? Math.floor(
                      (Date.now() - new Date(last).getTime()) / 86400000
                    )
                  : null;
                const isStale = daysAgo !== null && daysAgo > 90;
                return (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                  onClick={() => openDetail(c)}
                >
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">
                    <TypeBadges types={c.types} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.city ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {last ? (
                      <div className="flex flex-col">
                        <span className="text-sm tabular-nums">
                          {formatDate(last)}
                        </span>
                        <span
                          className={
                            isStale
                              ? "text-xs text-amber-500"
                              : "text-xs text-muted-foreground"
                          }
                        >
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
                  <td className="px-3 py-2">
                    <PriorityBadge rating={c.rating} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.phone ?? c.email ?? c.instagram ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(c)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(c)}
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
        </>
      )}

      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editing}
        onSaved={() => void refresh()}
      />

      <ContactDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailId}
        onEdit={(c) => {
          setDetailOpen(false);
          openEdit(c);
        }}
        onCreateGig={startGigWithContact}
      />

      <GigForm
        open={gigFormOpen}
        onOpenChange={setGigFormOpen}
        gig={null}
        prefillPromoter={gigPromoter}
        onSaved={() => {
          setGigPromoter(null);
          toast.success("GIG criada — confira na aba GIGs");
        }}
      />
    </div>
  );
}

function PriorityBadge({ rating }: { rating: number | null }) {
  const p = ratingToPriority(rating);
  if (!p) return null;
  const color =
    p === "Alta"
      ? "text-red-500"
      : p === "Média"
      ? "text-orange-500"
      : "text-yellow-500";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={`Prioridade ${p}`}
    >
      <Star className={cn("h-3.5 w-3.5 shrink-0 fill-current", color)} />
      {p}
    </span>
  );
}

function ContactCard({
  contact: c,
  onOpen,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const photoUrl = useImageUrl(c.photo_path);
  const last = c.last_interaction_at;
  const daysAgo = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
    : null;
  const initials = c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-md"
    >
      {/* ações no hover */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
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
      {/* Avatar */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-background">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={c.name}
            className="h-full w-full object-cover object-top transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
            {initials || <User className="h-6 w-6" />}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium leading-tight">{c.name}</span>
          <PriorityBadge rating={c.rating} />
        </div>
        {c.company && <div className="truncate text-xs text-muted-foreground">{c.company}</div>}
        <TypeBadges types={c.types} />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">{c.city ?? "—"}</span>
          {last && (
            <span className="shrink-0 pl-2">
              {daysAgo === 0 ? "hoje" : daysAgo === 1 ? "ontem" : `há ${daysAgo}d`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
