import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, Store, Trash2, User, UserPlus, Users } from "lucide-react";
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

type Role = "Contato" | "Fornecedor";
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
          roles: supId != null ? ["Contato", "Fornecedor"] : ["Contato"],
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
    if (r === "Contato" || r === "Fornecedor") setRole(r);
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

  function newContact() {
    setEditingContact(null);
    setContactFormOpen(true);
  }
  function newSupplier() {
    setEditingSupplier(null);
    setSupplierFormOpen(true);
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
        primaryAction={{ label: "Novo contato", icon: Plus, onClick: newContact }}
        secondaryActions={[{ label: "Novo fornecedor", icon: Store, onClick: newSupplier }]}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar nome, @, email, telefone…",
        }}
        viewToggle={<RoleTabs value={role} onChange={setRole} />}
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
      ) : (
        <div className="divide-y overflow-hidden rounded-md border">
          {filtered.map((p) => (
            <PersonRow
              key={p.key}
              person={p}
              onOpen={() => openPerson(p)}
              onEdit={() => editPerson(p)}
              onMakeSupplier={() => void makeSupplier(p)}
              onMakeContact={() => void makeContact(p)}
              onDelete={() => void handleDelete(p)}
            />
          ))}
        </div>
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

function RoleTabs({
  value,
  onChange,
}: {
  value: RoleFilter;
  onChange: (v: RoleFilter) => void;
}) {
  const opts: RoleFilter[] = ["Todos", "Contato", "Fornecedor"];
  return (
    <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition",
            value === o
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o === "Contato" ? "Contatos" : o === "Fornecedor" ? "Fornecedores" : "Todos"}
        </button>
      ))}
    </div>
  );
}

function RoleBadges({ roles }: { roles: Role[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.includes("Contato") && (
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" /> Contato
        </Badge>
      )}
      {roles.includes("Fornecedor") && (
        <Badge variant="outline" className="gap-1">
          <Store className="h-3 w-3" /> Fornecedor
        </Badge>
      )}
    </div>
  );
}

function PersonRow({
  person: p,
  onOpen,
  onEdit,
  onMakeSupplier,
  onMakeContact,
  onDelete,
}: {
  person: Person;
  onOpen: () => void;
  onEdit: () => void;
  onMakeSupplier: () => void;
  onMakeContact: () => void;
  onDelete: () => void;
}) {
  const sub = p.email ?? p.phone ?? p.instagram ?? p.city ?? "—";
  const canBecomeSupplier = p.contact != null && p.supplierId == null;
  const canBecomeContact = p.contact == null && p.supplier != null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-muted/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {p.contact ? <User className="h-4 w-4" /> : <Store className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium leading-tight">{p.name}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      <div className="hidden sm:block">
        <RoleBadges roles={p.roles} />
      </div>
      <div className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground md:block">
        {p.city ?? ""}
      </div>
      <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
        {canBecomeSupplier && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Tornar fornecedor"
            title="Tornar também fornecedor"
            onClick={onMakeSupplier}
          >
            <Store className="h-4 w-4" />
          </Button>
        )}
        {canBecomeContact && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Tornar contato"
            title="Tornar também contato"
            onClick={onMakeContact}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" aria-label="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
