import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Pencil, Plus, Search, Trash2, User, Users } from "lucide-react";
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
import { TypeBadges } from "./components/TypeBadges";
import { ContactForm } from "./forms/ContactForm";
import { ContactDetail } from "./forms/ContactDetail";
import {
  deleteContact,
  listContacts,
  type ContactFilters,
} from "./api";
import { CONTACT_TYPES, ratingToPriority, type Contact, type ContactType } from "./types";
import { Badge } from "@/components/ui/badge";
import { GigForm } from "@/modules/gigs/forms/GigForm";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { formatDate } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type TypeFilter = ContactType | "Todos";
type ViewMode = "cards" | "list";

export function CrmPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filters, setFilters] = useState<{
    type: TypeFilter;
    city: string;
    search: string;
  }>({ type: "Todos", city: "", search: "" });

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
    const data = await listContacts(queryFilters);
    setContacts(data);
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    const ok = window.confirm(
      `Excluir "${c.name}"? GIGs vinculadas perderão a referência ao promoter.`
    );
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, telefone, @…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-72 pl-8"
            />
          </div>
          <Select
            value={filters.type}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, type: v as TypeFilter }))
            }
          >
            <SelectTrigger className="w-56">
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
            className="w-40"
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

      {contacts.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
          Nenhum contato encontrado.
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {contacts.map((c) => (
            <ContactCard key={c.id} contact={c} onOpen={() => openDetail(c)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Cidade</th>
                <th className="px-3 py-2 text-left">Contato</th>
                <th className="px-3 py-2 text-left">Último contato</th>
                <th className="px-3 py-2 text-left">Prioridade</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
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
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.phone ?? c.email ?? c.instagram ?? "—"}
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
  if (!p) return <span className="text-xs text-muted-foreground">—</span>;
  const variant =
    p === "Alta" ? "destructive" : p === "Média" ? "warning" : "secondary";
  return <Badge variant={variant}>{p}</Badge>;
}

function ContactCard({ contact: c, onOpen }: { contact: Contact; onOpen: () => void }) {
  const photoUrl = useImageUrl(c.photo_path);
  const last = c.last_interaction_at;
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
            alt={c.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <User className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="font-medium leading-tight">{c.name}</div>
        <TypeBadges types={c.types} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{c.city ?? "—"}</span>
          <PriorityBadge rating={c.rating} />
        </div>
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
