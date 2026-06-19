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
  upsertSupplierMirror,
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
import { removeSupplierForContact } from "@/modules/suppliers/api";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { useModuleView } from "@/lib/moduleView";
import { useImageUrl } from "@/lib/uploads";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { ColResizer, useResizableColumns } from "@/lib/resizableColumns";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/modules/crm/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = RelationshipType;
type RoleFilter = "Todos" | Role;

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
};

export function PessoasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState<RoleFilter>("Todos");
  const [view, setView] = useModuleView<"cards" | "list">("pessoas", "cards");

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
    if (r && (RELATIONSHIP_TYPES as readonly string[]).includes(r)) setRole(r as Role);
    if (openId || supId) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cq = city.trim().toLowerCase();
    return persons.filter((p) => {
      if (role !== "Todos" && !p.roles.includes(role)) return false;
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
  }, [persons, role, city, search]);

  const { sorted, sortKey, sortDir, handleSort } = useTableSort(filtered);

  function newContact() {
    setEditingContact(null);
    setContactFormOpen(true);
  }
  useNewItemShortcut(newContact);

  function openPerson(p: Person) {
    if (p.contact) setContactDetailId(p.contact.id);
    else if (p.supplierId != null) setSupplierDetailId(p.supplierId);
  }

  function editPerson(p: Person) {
    if (p.contact) {
      setEditingContact(p.contact);
      setContactFormOpen(true);
    } else if (p.supplier) {
      setEditingSupplier(p.supplier);
      setSupplierFormOpen(true);
    }
  }

  async function makeSupplier(p: Person) {
    if (!p.contact) return;
    try {
      await upsertSupplierMirror(p.contact);
      toast.success(`${p.contact.name} agora também é fornecedor`);
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
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

  // Remove o papel de fornecedor (só se a aba Serviços estiver vazia).
  async function removeFornecedor(p: Person) {
    if (!p.contact || p.supplierId == null) return;
    const res = await removeSupplierForContact(p.contact.id);
    if (!res.ok) {
      toast.error(res.reason ?? "Não foi possível remover o papel de fornecedor");
      return;
    }
    toast.success(`${p.contact.name} não é mais fornecedor`);
    await refresh();
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
            <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos os papéis</SelectItem>
                {RELATIONSHIP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          description="Crie um contato ou fornecedor, ou ajuste a busca/filtros."
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((p) => (
            <PersonCard
              key={p.key}
              person={p}
              onOpen={() => openPerson(p)}
              onEdit={() => editPerson(p)}
              onMakeSupplier={() => void makeSupplier(p)}
              onMakeContact={() => void makeContact(p)}
              onRemoveSupplier={() => void removeFornecedor(p)}
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
          onMakeSupplier={(p) => void makeSupplier(p)}
          onMakeContact={(p) => void makeContact(p)}
          onRemoveSupplier={(p) => void removeFornecedor(p)}
          onDelete={(p) => void handleDelete(p)}
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
        onOpenChange={(v) => !v && setContactDetailId(null)}
        contactId={contactDetailId}
        onEdit={(c) => {
          setContactDetailId(null);
          setEditingContact(c);
          setContactFormOpen(true);
        }}
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

function RoleBadges({ roles }: { roles: Role[] }) {
  if (roles.length === 0)
    return <span className="text-xs text-muted-foreground">Pessoa</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r} variant={r === "Fornecedor" ? "outline" : "secondary"} className="gap-1">
          {r === "Fornecedor" && <Store className="h-3 w-3" />}
          {r}
        </Badge>
      ))}
    </div>
  );
}

type RowHandlers = {
  onEdit: () => void;
  onMakeSupplier: () => void;
  onMakeContact: () => void;
  onRemoveSupplier: () => void;
  onDelete: () => void;
};

/** Ações de uma pessoa (toggle de papel aplicável + editar + excluir). */
function PersonActions({
  person: p,
  onEdit,
  onMakeSupplier,
  onMakeContact,
  onRemoveSupplier,
  onDelete,
  buttonClass,
}: { person: Person; buttonClass?: string } & RowHandlers) {
  const canBecomeSupplier = p.contact != null && p.supplierId == null;
  const isContactSupplier = p.contact != null && p.supplierId != null;
  const canBecomeContact = p.contact == null && p.supplier != null;
  const cls = buttonClass ?? "";
  return (
    <>
      {canBecomeSupplier && (
        <Button size="icon" variant="ghost" className={cls} aria-label="Tornar fornecedor" title="Tornar também fornecedor" onClick={onMakeSupplier}>
          <Store className="h-4 w-4" />
        </Button>
      )}
      {isContactSupplier && (
        <Button size="icon" variant="ghost" className={cls} aria-label="Remover fornecedor" title="Remover papel de fornecedor" onClick={onRemoveSupplier}>
          <Store className="h-4 w-4 text-primary" />
        </Button>
      )}
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
  const sub = p.email ?? p.phone ?? p.instagram ?? "—";
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
      <div
        className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <PersonActions person={p} buttonClass="h-7 w-7 bg-card shadow-sm" {...handlers} />
      </div>
      <PersonAvatarName person={p} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="truncate font-medium leading-tight">{p.name}</div>
        <RoleBadges roles={p.roles} />
        <div className="truncate text-[11px] text-muted-foreground">
          {(p.city ?? "—") + " · " + sub}
        </div>
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
  ...handlers
}: {
  persons: Person[];
  sortKey: keyof Person | null;
  sortDir: "asc" | "desc" | null;
  onSort: (k: keyof Person) => void;
  onOpen: (p: Person) => void;
  onEdit: (p: Person) => void;
  onMakeSupplier: (p: Person) => void;
  onMakeContact: (p: Person) => void;
  onRemoveSupplier: (p: Person) => void;
  onDelete: (p: Person) => void;
}) {
  const cols = useResizableColumns("pessoas", [
    { id: "name", width: 260, min: 160 },
    { id: "roles", width: 200 },
    { id: "city", width: 150 },
    { id: "contact", width: 200 },
    { id: "actions", width: 130, min: 110 },
  ]);
  const tableWidth = cols.defs.reduce((s, c) => s + cols.widths[c.id], 0);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="table-fixed text-sm" style={{ width: tableWidth }}>
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
              <td className="px-3 py-2 text-muted-foreground">{p.city ?? "—"}</td>
              <td className="truncate px-3 py-2 text-muted-foreground">
                {p.email ?? p.phone ?? p.instagram ?? "—"}
              </td>
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  <PersonActions
                    person={p}
                    onEdit={() => handlers.onEdit(p)}
                    onMakeSupplier={() => handlers.onMakeSupplier(p)}
                    onMakeContact={() => handlers.onMakeContact(p)}
                    onRemoveSupplier={() => handlers.onRemoveSupplier(p)}
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
