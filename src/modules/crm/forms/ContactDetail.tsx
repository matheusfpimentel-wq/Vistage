import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarRange, DollarSign, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { useUnsavedConfirm } from "@/lib/dirty";
import { cn } from "@/lib/utils";
import {
  CONTACT_PRIORITIES,
  CONTACT_RELATIONSHIP_TYPES,
  priorityToRating,
  ratingToPriority,
  type Contact,
  type ContactPriority,
  type ContactRelationshipType,
  type ContactStats,
  type RelationshipData,
  type RelationshipType,
} from "../types";
import { RELATIONSHIP_ICON } from "../relationMeta";
import { InteractionList } from "../components/InteractionList";
import {
  getContact,
  getContactStats,
  getMirrorState,
  listGigsByContact,
  removeStudentForContact,
  updateContact,
  upsertStudentMirror,
  upsertSupplierMirror,
} from "../api";
import { createFan, findFanIdByContactId } from "@/modules/fans/api";
import {
  getSupplierIdForContact,
  removeSupplierForContact,
} from "@/modules/suppliers/api";
import type { Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { formatCurrency, formatDate, formatPhoneBR } from "@/lib/format";
import {
  RELATION_TAB_LABEL,
  RelationshipTabContent,
  ServicesTabContent,
} from "@/modules/pessoas/RelationshipTabs";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number | null;
  onCreateGig: (contact: Contact) => void;
};

/** Campos base editáveis inline na aba Informações. */
type BaseForm = {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  city: string | null;
  birthday: string | null;
  tags: string[];
  notes: string | null;
  rating: number | null;
  photo_path: string | null;
};

function toBaseForm(c: Contact): BaseForm {
  return {
    name: c.name,
    company: c.company ?? null,
    phone: c.phone,
    email: c.email,
    instagram: c.instagram,
    city: c.city,
    birthday: c.birthday ?? null,
    tags: c.tags,
    notes: c.notes,
    rating: c.rating,
    photo_path: c.photo_path,
  };
}

export function ContactDetail({
  open,
  onOpenChange,
  contactId,
  onCreateGig,
}: Props) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [mirror, setMirror] = useState({ fan: false, student: false });
  const [linking, setLinking] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("info");

  // edição inline dos campos base (aba Informações) + rascunho das abas de relação
  const [form, setForm] = useState<BaseForm | null>(null);
  // Rascunho compartilhado dos dados de cada relação — editado nas abas e gravado
  // junto com os campos base num único "Salvar".
  const [relDraft, setRelDraft] = useState<RelationshipData>({});
  const [dirty, setDirty] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const confirmClose = useUnsavedConfirm(dirty);

  async function refresh(opts?: { reseedForm?: boolean }) {
    if (!contactId) return;
    setLoading(true);
    try {
      const [c, s, g, sup, m] = await Promise.all([
        getContact(contactId),
        getContactStats(contactId),
        listGigsByContact(contactId),
        getSupplierIdForContact(contactId),
        getMirrorState(contactId),
      ]);
      setContact(c);
      setStats(s);
      setGigs(g);
      setSupplierId(sup);
      setMirror({ fan: m.fan, student: m.student });
      if (c && (opts?.reseedForm ?? false)) {
        setForm(toBaseForm(c));
        setRelDraft(c.relationship_data ?? {});
        setDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && contactId) {
      setTab("info");
      void refresh({ reseedForm: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId]);

  if (!contactId) return null;

  const relTypes = contact?.relationship_types ?? [];

  const setF = (patch: Partial<BaseForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };

  // Atualiza o rascunho de uma relação (vindo de uma aba) e marca como sujo.
  const setRelField = (type: ContactRelationshipType, d: Record<string, unknown>) => {
    setRelDraft((prev) => ({ ...prev, [type]: d }) as RelationshipData);
    setDirty(true);
  };

  // ── Relação: seleção aplica na hora; remoção avisa e apaga a aba ───────────
  async function toggleRelType(type: ContactRelationshipType) {
    if (!contact) return;
    const active = relTypes.includes(type);
    if (active) {
      const data = (relDraft[type] ?? {}) as Record<string, unknown>;
      const hasData = Object.values(data).some(
        (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
      );
      if (hasData) {
        const ok = await confirmDialog({
          title: `Remover relação ${type}`,
          description: `Isso vai apagar tudo da aba "${RELATION_TAB_LABEL[type]}" desta pessoa. Tem certeza?`,
          confirmLabel: "Remover",
          destructive: true,
        });
        if (!ok) return;
      }
      // Constrói a partir do RASCUNHO pra não descartar edições não salvas de
      // outras abas; mantém DB e rascunho em sincronia.
      const nextData: RelationshipData = { ...relDraft };
      delete nextData[type];
      setRelDraft(nextData);
      await updateContact({
        id: contact.id,
        relationship_types: relTypes.filter((t) => t !== type),
        relationship_data: nextData,
      });
      if (tab === `rel-${type}`) setTab("info");
      await refresh();
    } else {
      await updateContact({
        id: contact.id,
        relationship_types: [...relTypes, type],
      });
      await refresh();
      setTab(`rel-${type}`);
    }
  }

  async function toggleSupplier() {
    if (!contact) return;
    if (supplierId == null) {
      await upsertSupplierMirror(contact);
      await refresh();
      setTab("servicos");
      toast.success("Fornecedor adicionado");
    } else {
      const ok = await confirmDialog({
        title: "Remover relação Fornecedor",
        description:
          'Isso vai apagar a aba "Serviços" e todos os serviços cadastrados desta pessoa. Tem certeza?',
        confirmLabel: "Remover",
        destructive: true,
      });
      if (!ok) return;
      const res = await removeSupplierForContact(contact.id, { force: true });
      if (!res.ok) {
        toast.error(res.reason ?? "Não foi possível remover o papel de fornecedor");
        return;
      }
      if (tab === "servicos") setTab("info");
      await refresh();
    }
  }

  async function toggleStudentMirror() {
    if (!contact) return;
    if (!mirror.student) {
      await upsertStudentMirror(contact);
      await refresh();
      toast.success("Perfil de aluno criado");
    } else {
      const ok = await confirmDialog({
        title: "Remover perfil de aluno",
        description: "Isso vai excluir o perfil paralelo de aluno desta pessoa. Tem certeza?",
        confirmLabel: "Remover",
        destructive: true,
      });
      if (!ok) return;
      await removeStudentForContact(contact.id);
      await refresh();
    }
  }

  // Conversão manual Pessoa → Fã (§14): cria um fã semeado a partir do contato,
  // guardando a procedência em fans.contact_id. NUNCA apaga — é um clone pontual,
  // sem sync (diferente do antigo chip-espelho destrutivo, aposentado).
  async function handleMakeFan() {
    if (!contact) return;
    const existing = await findFanIdByContactId(contact.id);
    if (existing != null) {
      toast.info("Esta pessoa já é um fã.", {
        action: { label: "Abrir", onClick: () => navigate(`/fas?open=${existing}`) },
      });
      return;
    }
    setLinking(true);
    try {
      const fanId = await createFan({
        name: contact.name,
        level: "Possível fã",
        is_ambassador: 0,
        instagram: contact.instagram,
        email: contact.email,
        phone: contact.phone,
        city: contact.city,
        tags: [],
        notes: contact.notes,
        photo_path: contact.photo_path,
        contact_id: contact.id,
        origem: "Pessoas (CRM)",
      });
      await refresh();
      toast.success("Fã criado a partir desta pessoa.", {
        action: { label: "Abrir", onClick: () => navigate(`/fas?open=${fanId}`) },
      });
    } catch (e) {
      toast.error(`Erro ao criar fã: ${String(e)}`);
    } finally {
      setLinking(false);
    }
  }

  // ── Campos base ────────────────────────────────────────────────────────────
  function addTag() {
    const t = tagInput.trim();
    if (!t || !form) return;
    if (form.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setF({ tags: [...form.tags, t] });
    setTagInput("");
  }

  // Único "Salvar" do diálogo: grava os campos base E o rascunho de todas as
  // relações de uma vez, depois fecha. Assim dá pra editar várias abas e salvar
  // tudo junto no fim, sem perder nada.
  async function saveAll() {
    if (!contact || !form) return;
    if (!form.name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    setSavingBase(true);
    try {
      await updateContact({
        id: contact.id,
        name: form.name.trim(),
        company: form.company,
        phone: form.phone,
        email: form.email,
        instagram: form.instagram,
        city: form.city,
        birthday: form.birthday,
        tags: form.tags,
        notes: form.notes,
        rating: form.rating,
        photo_path: form.photo_path,
        relationship_data: relDraft,
      });
      toast.success("Salvo");
      setDirty(false); // limpa antes de fechar — sem aviso de não-salvo
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSavingBase(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-3xl">
        {loading || !contact || !form ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <DialogTitle>{contact.name}</DialogTitle>
                  <RoleIconBadges
                    roles={[
                      ...relTypes,
                      ...(supplierId != null ? (["Fornecedor"] as RelationshipType[]) : []),
                    ]}
                  />
                </div>
                <Button size="sm" onClick={() => onCreateGig(contact)}>
                  <Plus className="h-3.5 w-3.5" />
                  Nova GIG
                </Button>
              </div>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                icon={<CalendarRange className="h-4 w-4" />}
                label="GIGs vinculadas"
                value={stats?.gigCount.toString() ?? "0"}
              />
              <Stat
                icon={<DollarSign className="h-4 w-4" />}
                label="Já gerou"
                value={stats ? formatCurrency(stats.totalRevenue ?? 0) : "—"}
              />
              <Stat
                icon={<CalendarRange className="h-4 w-4" />}
                label="Última GIG"
                value={stats?.lastGigDate ? formatDate(stats.lastGigDate) : "—"}
              />
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap">
                <TabsTrigger value="info">Informações</TabsTrigger>
                {relTypes.map((t) => (
                  <TabsTrigger key={t} value={`rel-${t}`}>
                    {RELATION_TAB_LABEL[t]}
                  </TabsTrigger>
                ))}
                {supplierId != null && (
                  <TabsTrigger value="servicos">Serviços</TabsTrigger>
                )}
                <TabsTrigger value="gigs">GIGs ({gigs.length})</TabsTrigger>
                <TabsTrigger value="interactions">Interações</TabsTrigger>
              </TabsList>

              {/* ── Informações (editável) ── */}
              <TabsContent value="info" className="space-y-4 pt-2">
                {/* Cabeçalho: foto pequena/quadrada à esquerda + Nome/Empresa à direita */}
                <div className="flex items-start gap-3">
                  <div className="w-24 shrink-0 sm:w-28">
                    <AttachmentField
                      label="Foto"
                      value={form.photo_path}
                      onChange={(v) => setF({ photo_path: v })}
                      subdir="contacts"
                      variant="image"
                      square
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <Label>
                        Nome <span className="text-destructive">*</span>
                      </Label>
                      <Input value={form.name} onChange={(e) => setF({ name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Empresa</Label>
                      <Input
                        placeholder="Nome da empresa / produtora…"
                        value={form.company ?? ""}
                        onChange={(e) => setF({ company: e.target.value || null })}
                      />
                    </div>
                  </div>
                </div>

                {/* Relação — seleção cria a aba; remoção avisa antes de apagar.
                    Fã/Aluno CRIAM um perfil novo → ícone + e aviso abaixo. */}
                <div className="space-y-1.5">
                  <Label>Relação</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CONTACT_RELATIONSHIP_TYPES.map((type) => (
                      <RelButton
                        key={type}
                        label={type}
                        active={relTypes.includes(type)}
                        onClick={() => void toggleRelType(type)}
                      />
                    ))}
                    <RelButton
                      label="Fornecedor"
                      active={supplierId != null}
                      onClick={() => void toggleSupplier()}
                    />
                    <RelButton
                      label="Fã"
                      active={mirror.fan}
                      disabled={linking}
                      icon={mirror.fan ? undefined : <Plus className="h-3 w-3" />}
                      title={mirror.fan ? "Já é um fã — abrir" : "Cria um novo perfil de fã vinculado a esta pessoa"}
                      onClick={() => void handleMakeFan()}
                    />
                    <RelButton
                      label="Aluno"
                      active={mirror.student}
                      icon={mirror.student ? undefined : <Plus className="h-3 w-3" />}
                      title={mirror.student ? "Perfil de aluno vinculado" : "Cria um novo perfil de aluno vinculado a esta pessoa"}
                      onClick={() => void toggleStudentMirror()}
                    />
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Plus className="h-3 w-3 shrink-0" />
                    Fã e Aluno criam um perfil novo, vinculado a esta pessoa.
                  </p>
                </div>

                {/* Campos curtos: prioridade · aniversário · cidade · tags (4 colunas) */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Prioridade</Label>
                    <Select
                      value={ratingToPriority(form.rating) ?? "none"}
                      onValueChange={(v) =>
                        setF({ rating: v === "none" ? null : priorityToRating(v as ContactPriority) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhuma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {CONTACT_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Aniversário</Label>
                    <Input type="date" value={form.birthday ?? ""} onChange={(e) => setF({ birthday: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cidade</Label>
                    <Input value={form.city ?? ""} onChange={(e) => setF({ city: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <Input
                      placeholder="Tag + Enter"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                    />
                    {form.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {form.tags.map((t) => (
                          <Badge key={t} variant="outline" className="gap-1 pr-1">
                            {t}
                            <button
                              type="button"
                              onClick={() => setF({ tags: form.tags.filter((x) => x !== t) })}
                              className="rounded p-0.5 hover:bg-accent"
                              aria-label="Remover tag"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Contatos: telefone (máscara), redes (curto), email (largo) */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label>Telefone</Label>
                    <Input
                      className="w-44"
                      placeholder="(00) 90000-0000"
                      value={form.phone ?? ""}
                      onChange={(e) => setF({ phone: e.target.value || null })}
                      onBlur={() => {
                        const f = formatPhoneBR(form.phone);
                        if (f && f !== form.phone) setF({ phone: f });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Redes sociais</Label>
                    <Input className="w-40" placeholder="@usuario" value={form.instagram ?? ""} onChange={(e) => setF({ instagram: e.target.value || null })} />
                  </div>
                  <div className="min-w-[15rem] flex-1 space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={form.email ?? ""} onChange={(e) => setF({ email: e.target.value || null })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Notas</Label>
                  <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setF({ notes: e.target.value || null })} />
                </div>
              </TabsContent>

              {/* ── Abas por relação ── */}
              {relTypes.map((t) => (
                <TabsContent key={t} value={`rel-${t}`}>
                  <RelationshipTabContent
                    type={t}
                    contactId={contact.id}
                    data={(relDraft[t] ?? {}) as Record<string, unknown>}
                    onChange={(d) => setRelField(t, d)}
                    onCreateGig={t === "Contratante" ? () => onCreateGig(contact) : undefined}
                  />
                </TabsContent>
              ))}
              {supplierId != null && (
                <TabsContent value="servicos">
                  <ServicesTabContent supplierId={supplierId} />
                </TabsContent>
              )}

              {/* ── GIGs ── */}
              <TabsContent value="gigs">
                {gigs.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhuma GIG vinculada ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {gigs.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between rounded-md border p-2.5 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            <Link to={`/gigs?open=${g.id}`} className="text-primary hover:underline">
                              {gigDisplayName(g)}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {g.venue_name} · {formatDate(g.date)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(g.cache_amount)}
                          </span>
                          <StatusBadge status={g.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Interações ── */}
              <TabsContent value="interactions">
                <InteractionList contactId={contact.id} onChange={() => void refresh()} />
              </TabsContent>
            </Tabs>

            {/* Salvar único: grava Informações + todas as relações de uma vez. */}
            <div className="flex items-center justify-end gap-2 border-t pt-3">
              {dirty && (
                <span className="mr-auto text-xs text-muted-foreground">Alterações não salvas</span>
              )}
              <Button variant="outline" onClick={() => confirmClose(false, () => onOpenChange(false))}>
                Fechar
              </Button>
              <Button onClick={() => void saveAll()} disabled={savingBase || !dirty}>
                {savingBase && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Badges com ícone dos papéis da pessoa (substitui os tipos do modelo antigo). */
function RoleIconBadges({ roles }: { roles: RelationshipType[] }) {
  if (roles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {roles.map((r) => {
        const Icon = RELATIONSHIP_ICON[r];
        return (
          <Badge key={r} variant="outline" className="gap-1">
            {Icon && <Icon className="h-3 w-3" />}
            {r}
          </Badge>
        );
      })}
    </div>
  );
}

function RelButton({
  label,
  active,
  onClick,
  icon,
  title,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Ícone à esquerda (ex.: + para botões que CRIAM um perfil novo). */
  icon?: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50",
        active
          ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
          : "border-input bg-background hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
