import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, List, Pencil, Plus, Store, Trash2, User, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/Skeleton";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { cn } from "@/lib/utils";
import { useNewItemShortcut } from "@/lib/shortcuts";
// CRM (contatos)
import { ContactForm } from "@/modules/crm/forms/ContactForm";
import { ContactDetail } from "@/modules/crm/forms/ContactDetail";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
} from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
// Fornecedores
import { SupplierForm } from "@/modules/suppliers/forms/SupplierForm";
import { SupplierDetail } from "@/modules/suppliers/SupplierDetail";
import {
  deleteSupplier,
  listSupplierContactLinks,
  listSuppliers,
  setSupplierContact,
} from "@/modules/suppliers/api";
import type { Supplier } from "@/modules/suppliers/types";
import { GigForm } from "@/modules/gigs/forms/GigForm";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { ListDensityToggle, useListDensity, type ListDensity } from "@/components/shared/ListDensityToggle";
import { useModuleView } from "@/lib/moduleView";
import { useImageUrl } from "@/lib/uploads";
import { persistDocSetting } from "@/lib/docSettings";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { ColResizer, useResizableColumns } from "@/lib/resizableColumns";
import {
  RELATIONSHIP_TYPES,
  ratingToPriority,
  type ContactPriority,
  type RelationshipType,
} from "@/modules/crm/types";
import { RELATIONSHIP_ICON } from "@/modules/crm/relationMeta";

type Role = RelationshipType;

const ROLE_FILTER_KEY = "vistage.filter.pessoas.roles";

function loadRoleFilter(): Role[] {
  try {
    const raw = localStorage.getItem(ROLE_FILTER_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr))
        return arr.filter((x): x is Role => (RELATIONSHIP_TYPES as readonly string[]).includes(x));
    }
  } catch {
    /* ignora json inválido */
  }
  return [];
}

/** Pessoa unificada: um contato, um fornecedor, ou ambos (papel duplo). */
type Person = {
  key: string;
  /** Contato canônico, quando a pessoa é um contato. */
  contact: Contact | null;
  /** Fornecedor puro (sem contato vinculado), quando aplicável. */
  supplier: Supplier | null;
  /** id do fornecedor vinculado (papel Fornecedor), seja puro ou espelho. */
  supplierId: number | null;
  name: string;
  city: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  roles: Role[];
  priority: ContactPriority | null;
  /** Rank numérico p/ ordenar por prioridade (rating 1–5; 0 = sem nota). */
  priorityRank: number;
};

export function PessoasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role[]>(loadRoleFilter);
  const [view, setView] = useModuleView<"cards" | "list">("pessoas", "cards");
  const [density, setDensity] = useListDensity("pessoas");

  // Filtro de papéis por ícones (multi-seleção). Persiste no .vistage.
  function toggleRoleFilter(t: Role) {
    setRoleFilter((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      persistDocSetting(ROLE_FILTER_KEY, JSON.stringify(next));
      return next;
    });
  }

  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [contactDetailId, setContactDetailId] = useState<number | null>(null);
  const [supplierDetailId, setSupplierDetailId] = useState<number | null>(null);

  const [gigFormOpen, setGigFormOpen] = useState(false);
  const [gigPromoter, setGigPromoter] = useState<Contact | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, suppliers, links] = await Promise.all([
        listContacts(),
        listSuppliers(),
        listSupplierContactLinks(),
      ]);
      const supplierByContact = new Map<number, number>();
      for (const l of links) if (l.contact_id != null) supplierByContact.set(l.contact_id, l.id);
      const linkedSupplierIds = new Set(supplierByContact.values());

      const list: Person[] = [];
      for (const c of contacts) {
        const supId = supplierByContact.get(c.id) ?? null;
        list.push({
          key: `c${c.id}`,
          contact: c,
          supplier: null,
          supplierId: supId,
          name: c.name,
          city: c.city,
          email: c.email,
          phone: c.phone,
          instagram: c.instagram,
          roles: [
            ...c.relationship_types,
            ...(supId != null ? (["Fornecedor"] as Role[]) : []),
          ],
          priority: ratingToPriority(c.rating),
          priorityRank: c.rating ?? 0,
        });
      }
      for (const s of suppliers) {
        if (linkedSupplierIds.has(s.id)) continue; // já representado pelo contato
        list.push({
          key: `s${s.id}`,
          contact: null,
          supplier: s,
          supplierId: s.id,
          name: s.name,
          city: s.city,
          email: s.email,
          phone: s.phone,
          instagram: s.instagram,
          roles: ["Fornecedor"],
          priority: ratingToPriority(s.rating),
          priorityRank: s.rating ?? 0,
        });
      }
      list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setPersons(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Deep-links de compatibilidade: ?open=<contactId> e ?supplier=<id>.
  useEffect(() => {
    const openId = searchParams.get("open");
    const supId = searchParams.get("supplier");
    if (openId) {
      const id = Number(openId);
      void getContact(id).then((c) => {
        if (c) setContactDetailId(c.id);
      });
    }
    if (supId && !Number.isNaN(Number(supId))) setSupplierDetailId(Number(supId));
    const r = searchParams.get("role");
    if (r && (RELATIONSHIP_TYPES as readonly string[]).includes(r)) setRoleFilter([r as Role]);
    if (openId || supId) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cq = city.trim().toLowerCase();
    return persons.filter((p) => {
      // multi-seleção: mostra quem tem QUALQUER um dos papéis marcados (OU).
      if (roleFilter.length > 0 && !p.roles.some((r) => roleFilter.includes(r))) return false;
      if (cq && !(p.city ?? "").toLowerCase().includes(cq)) return false;
      if (q) {
        const hay = [p.name, p.city, p.email, p.phone, p.instagram]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [persons, roleFilter, city, search]);

  // Padrão: ordena por PRIORIDADE (rank do rating), maior primeiro.
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(filtered, "priorityRank", "desc");

  function newContact() {
    setEditingContact(null);
    setContactFormOpen(true);
  }
  useNewItemShortcut(newContact);

  function openPerson(p: Person) {
    if (p.contact) setContactDetailId(p.contact.id);
    else if (p.supplierId != null) setSupplierDetailId(p.supplierId);
  }

  // Editar abre o mesmo diálogo de detalhe (agora editável, com abas por relação).
  function editPerson(p: Person) {
    if (p.contact) {
      setContactDetailId(p.contact.id);
    } else if (p.supplier) {
      setEditingSupplier(p.supplier);
      setSupplierFormOpen(true);
    }
  }

  // Inverso do toggle: dá o papel "Contato" a um fornecedor puro, criando um
  // contato espelho e vinculando-o (suppliers.contact_id). Aditivo e opt-in.
  async function makeContact(p: Person) {
    if (!p.supplier) return;
    const s = p.supplier;
    try {
      const contactId = await createContact({
        name: s.name,
        types: [],
        phone: s.phone,
        email: s.email,
        instagram: s.instagram,
        city: s.city,
        tags: [],
        notes: s.notes,
        rating: s.rating,
        photo_path: null,
        follower_count: null,
        venue_id: null,
        company: null,
      });
      await setSupplierContact(s.id, contactId);
      toast.success(`${s.name} agora também é contato`);
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleDelete(p: Person) {
    if (p.contact) {
      const ok = await confirmDialog({
        title: "Excluir",
        description: `Excluir o contato "${p.name}"? GIGs vinculadas perderão a referência ao promoter.${
          p.supplierId != null ? " O fornecedor espelho não será removido." : ""
        }`,
        confirmLabel: "Excluir",
        destructive: true,
      });
      if (!ok) return;
      await deleteContact(p.contact.id);
    } else if (p.supplier) {
      const ok = await confirmDialog({
        title: "Excluir",
        description: `Excluir o fornecedor "${p.name}"?`,
        confirmLabel: "Excluir",
        destructive: true,
      });
      if (!ok) return;
      await deleteSupplier(p.supplier.id);
    }
    toast.success("Excluído");
    await refresh();
  }

  function startGigWithContact(contact: Contact) {
    setGigPromoter(contact);
    setContactDetailId(null);
    setGigFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <ModuleToolbar
        primaryAction={{ label: "Nova pessoa", icon: Plus, onClick: newContact }}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar nome, @, email, telefone…",
        }}
        viewToggle={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por papel via ícones clicáveis (multi-seleção, persistente). */}
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {RELATIONSHIP_TYPES.map((t) => {
                const Icon = RELATIONSHIP_ICON[t];
                const active = roleFilter.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    title={t}
                    aria-label={t}
                    aria-pressed={active}
                    onClick={() => toggleRoleFilter(t)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition",
                      active
                        ? "bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/25 backdrop-blur-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
              {roleFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRoleFilter([]);
                    persistDocSetting(ROLE_FILTER_KEY, "[]");
                  }}
                  className="ml-0.5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Limpar filtro de papéis"
                >
                  limpar
                </button>
              )}
            </div>
            {view === "list" && (
              <ListDensityToggle value={density} onChange={setDensity} />
            )}
            <ViewToggle
              options={[
                { value: "cards", label: "Cards", icon: LayoutGrid },
                { value: "list", label: "Lista", icon: List },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
        }
        resultCount={filtered.length}
        resultLabel="pessoas"
        filtersActiveCount={city.trim() ? 1 : 0}
        filters={
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cidade</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Filtrar por cidade" />
          </div>
        }
      />

      {loading ? (
        <SkeletonList />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhuma pessoa encontrada"
          action={
            <Button size="sm" onClick={newContact}>
              <Plus className="h-4 w-4" /> Nova pessoa
            </Button>
          }
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((p) => (
            <PersonCard
              key={p.key}
              person={p}
              onOpen={() => openPerson(p)}
              onEdit={() => editPerson(p)}
              onMakeContact={() => void makeContact(p)}
              onDelete={() => void handleDelete(p)}
            />
          ))}
        </div>
      ) : (
        <PersonTable
          persons={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onOpen={openPerson}
          onEdit={editPerson}
          onMakeContact={(p) => void makeContact(p)}
          onDelete={(p) => void handleDelete(p)}
          density={density}
        />
      )}

      <ContactForm
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        contact={editingContact}
        onSaved={() => void refresh()}
      />
      <SupplierForm
        open={supplierFormOpen}
        onOpenChange={setSupplierFormOpen}
        supplier={editingSupplier}
        onSaved={() => void refresh()}
      />

      <ContactDetail
        open={contactDetailId != null}
        onOpenChange={(v) => {
          if (!v) {
            setContactDetailId(null);
            void refresh();
          }
        }}
        contactId={contactDetailId}
        onCreateGig={startGigWithContact}
      />
      <SupplierDetail
        open={supplierDetailId != null}
        onOpenChange={(v) => !v && setSupplierDetailId(null)}
        supplierId={supplierDetailId}
        onEdit={(s) => {
          setSupplierDetailId(null);
          setEditingSupplier(s);
          setSupplierFormOpen(true);
        }}
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

/** Badges dos papéis — todos com ícone próprio, no estilo "branco com ícone". */
function RoleBadges({ roles, iconOnly = false }: { roles: Role[]; iconOnly?: boolean }) {
  if (roles.length === 0)
    return <span className="text-xs text-muted-foreground">Pessoa</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => {
        const Icon = RELATIONSHIP_ICON[r];
        return (
          <Badge
            key={r}
            variant="outline"
            className={cn("gap-1", iconOnly && "px-1.5")}
            title={iconOnly ? r : undefined}
          >
            <Icon className="h-3 w-3" />
            {!iconOnly && r}
          </Badge>
        );
      })}
    </div>
  );
}

const PRIORITY_CLASS: Record<ContactPriority, string> = {
  Alta: "bg-red-500/15 text-red-600 dark:text-red-400",
  "Média": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Baixa: "bg-muted text-muted-foreground",
};

/** Selo compacto de prioridade da pessoa (some quando não definida). */
function PriorityBadge({ priority }: { priority: ContactPriority | null }) {
  if (!priority) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        PRIORITY_CLASS[priority]
      )}
      title={`Prioridade ${priority}`}
    >
      {priority}
    </span>
  );
}

type RowHandlers = {
  onEdit: () => void;
  onMakeContact: () => void;
  onDelete: () => void;
};

/** Ações de uma pessoa (editar + excluir; promover fornecedor puro a contato). */
function PersonActions({
  person: p,
  onEdit,
  onMakeContact,
  onDelete,
  buttonClass,
}: { person: Person; buttonClass?: string } & RowHandlers) {
  const canBecomeContact = p.contact == null && p.supplier != null;
  const cls = buttonClass ?? "";
  return (
    <>
      {canBecomeContact && (
        <Button size="icon" variant="ghost" className={cls} aria-label="Tornar contato" title="Tornar também contato" onClick={onMakeContact}>
          <UserPlus className="h-4 w-4" />
        </Button>
      )}
      <Button size="icon" variant="ghost" className={cls} aria-label="Editar" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className={cls} aria-label="Excluir" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </>
  );
}

/** Avatar (foto do contato) + nome — usado no card e na tabela. */
function PersonAvatarName({ person: p, size = "sm" }: { person: Person; size?: "sm" | "lg" }) {
  const photoUrl = useImageUrl(p.contact?.photo_path ?? null);
  const initials = p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const dim = size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  return (
    <div className="flex items-center gap-2">
      <div className={cn("relative shrink-0 overflow-hidden rounded-full bg-muted", dim)}>
        {photoUrl ? (
          <img src={photoUrl} alt={p.name} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-semibold text-muted-foreground">
            {initials || (p.contact ? <User className="h-1/2 w-1/2" /> : <Store className="h-1/2 w-1/2" />)}
          </div>
        )}
      </div>
      {size === "sm" && <span className="truncate font-medium">{p.name}</span>}
    </div>
  );
}

function PersonCard({
  person: p,
  onOpen,
  ...handlers
}: { person: Person; onOpen: () => void } & RowHandlers) {
  // Cidade sai do card; @ e prioridade entram (preferência do usuário).
  const sub = p.instagram ?? p.email ?? p.phone ?? null;
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
      <div
        className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <PersonActions person={p} buttonClass="h-7 w-7 bg-card shadow-sm" {...handlers} />
      </div>
      <PersonAvatarName person={p} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium leading-tight">{p.name}</span>
          <PriorityBadge priority={p.priority} />
        </div>
        <RoleBadges roles={p.roles} />
        {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function PersonTable({
  persons,
  sortKey,
  sortDir,
  onSort,
  onOpen,
  density = "full",
  ...handlers
}: {
  persons: Person[];
  sortKey: keyof Person | null;
  sortDir: "asc" | "desc" | null;
  onSort: (k: keyof Person) => void;
  onOpen: (p: Person) => void;
  onEdit: (p: Person) => void;
  onMakeContact: (p: Person) => void;
  onDelete: (p: Person) => void;
  density?: ListDensity;
}) {
  const cols = useResizableColumns("pessoas", [
    { id: "name", width: 240, min: 160 },
    { id: "roles", width: 190 },
    { id: "priority", width: 100, min: 80 },
    { id: "city", width: 140 },
    { id: "contact", width: 190 },
    { id: "actions", width: 130, min: 110 },
  ]);
  const tableWidth = cols.defs.reduce((s, c) => s + cols.widths[c.id], 0);
  const compact = density === "compact";
  return (
    <div className="overflow-x-auto rounded-md border">
      <table
        className={cn("table-fixed", compact ? "text-xs [&_td]:py-1 [&_th]:py-1" : "text-sm")}
        style={{ width: tableWidth }}
      >
        <colgroup>
          {cols.defs.map((c) => (
            <col key={c.id} style={cols.colStyle(c.id)} />
          ))}
        </colgroup>
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <SortableHeader<Person> col="name" label="Nome" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="px-3 py-2 text-left">
              <ColResizer {...cols.resizer("name")} />
            </SortableHeader>
            <th className="relative px-3 py-2 text-left">Papéis<ColResizer {...cols.resizer("roles")} /></th>
            <SortableHeader<Person> col="priorityRank" label="Prioridade" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="px-3 py-2 text-left">
              <ColResizer {...cols.resizer("priority")} />
            </SortableHeader>
            <SortableHeader<Person> col="city" label="Cidade" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="px-3 py-2 text-left">
              <ColResizer {...cols.resizer("city")} />
            </SortableHeader>
            <th className="relative px-3 py-2 text-left">Contato<ColResizer {...cols.resizer("contact")} /></th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => (
            <tr
              key={p.key}
              className="cursor-pointer border-t transition-colors hover:bg-muted/40"
              onClick={() => onOpen(p)}
            >
              <td className="px-3 py-2">
                <PersonAvatarName person={p} />
              </td>
              <td className="px-3 py-2">
                <RoleBadges roles={p.roles} />
              </td>
              <td className="px-3 py-2">
                {p.priority ? <PriorityBadge priority={p.priority} /> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{p.city ?? "—"}</td>
              <td className="truncate px-3 py-2 text-muted-foreground">
                {p.email ?? p.phone ?? p.instagram ?? "—"}
              </td>
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  <PersonActions
                    person={p}
                    onEdit={() => handlers.onEdit(p)}
                    onMakeContact={() => handlers.onMakeContact(p)}
                    onDelete={() => handlers.onDelete(p)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
