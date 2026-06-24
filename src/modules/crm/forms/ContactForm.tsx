import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { useUnsavedConfirm } from "@/lib/dirty";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONTACT_PRIORITIES,
  CONTACT_RELATIONSHIP_TYPES,
  priorityToRating,
  ratingToPriority,
  type Contact,
  type ContactCreateInput,
  type ContactPriority,
  type ContactRelationshipType,
} from "../types";
import {
  createContact,
  getContact,
  getMirrorState,
  removeFanForContact,
  removeStudentForContact,
  updateContact,
  upsertFanMirror,
  upsertStudentMirror,
  upsertSupplierMirror,
} from "../api";
import { removeSupplierForContact } from "@/modules/suppliers/api";
import { confirmDialog } from "@/components/ui/confirm";
import { listVenues } from "@/modules/venues/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSaved: (id: number) => void;
};

type FormState = ContactCreateInput;

const EMPTY: FormState = {
  name: "",
  types: [],
  relationship_types: [],
  relationship_data: {},
  phone: null,
  email: null,
  instagram: null,
  city: null,
  tags: [],
  notes: null,
  rating: null,
  photo_path: null,
  follower_count: null,
  venue_id: null,
  company: null,
  birthday: null,
};

function contactToState(c: Contact): FormState {
  return {
    name: c.name,
    types: c.types,
    relationship_types: c.relationship_types,
    relationship_data: c.relationship_data,
    phone: c.phone,
    email: c.email,
    instagram: c.instagram,
    city: c.city,
    tags: c.tags,
    notes: c.notes,
    rating: c.rating,
    photo_path: c.photo_path,
    follower_count: c.follower_count ?? null,
    venue_id: c.venue_id ?? null,
    company: c.company ?? null,
    birthday: c.birthday ?? null,
  };
}

export function ContactForm({ open, onOpenChange, contact, onSaved }: Props) {
  const [state, setStateRaw] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [venues, setVenues] = useState<{ id: number; name: string }[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [alsoSupplier, setAlsoSupplier] = useState(false);
  const [alsoStudent, setAlsoStudent] = useState(false);
  const [alsoFan, setAlsoFan] = useState(false);
  // estado inicial dos perfis paralelos (pra confirmar exclusão ao desmarcar)
  const [hadMirror, setHadMirror] = useState({ supplier: false, student: false, fan: false });
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  const setState: typeof setStateRaw = (v) => {
    setStateRaw(v);
    setDirty(true);
  };

  useEffect(() => {
    void listVenues({}).then((vs) => setVenues(vs.map((v) => ({ id: v.id, name: v.name }))));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (contact) setStateRaw(contactToState(contact));
    else setStateRaw(EMPTY);
    setTagInput("");
    setNameError(null);
    setAlsoSupplier(false);
    setAlsoStudent(false);
    setAlsoFan(false);
    setHadMirror({ supplier: false, student: false, fan: false });
    if (contact) {
      void getMirrorState(contact.id).then((m) => {
        setAlsoSupplier(m.supplier);
        setAlsoStudent(m.student);
        setAlsoFan(m.fan);
        setHadMirror(m);
      });
    }
    setDirty(false);
  }, [contact, open]);

  function toggleRelType(type: ContactRelationshipType) {
    setState((s) => {
      const cur = s.relationship_types ?? [];
      return {
        ...s,
        relationship_types: cur.includes(type)
          ? cur.filter((t) => t !== type)
          : [...cur, type],
      };
    });
  }

  // Fornecedor/Fã/Aluno: papéis que criam um perfil paralelo. Desmarcar um
  // perfil de fã/aluno já existente pede confirmação (exclui ao salvar).
  async function toggleParallel(kind: "supplier" | "fan" | "student") {
    const current = kind === "supplier" ? alsoSupplier : kind === "fan" ? alsoFan : alsoStudent;
    const setter = kind === "supplier" ? setAlsoSupplier : kind === "fan" ? setAlsoFan : setAlsoStudent;
    if (current && hadMirror[kind] && kind !== "supplier") {
      const label = kind === "fan" ? "fã" : "aluno";
      const ok = await confirmDialog({
        title: "Remover perfil paralelo",
        description: `Isso vai excluir o perfil de ${label} desta pessoa ao salvar. Tem certeza?`,
        confirmLabel: "Remover",
        destructive: true,
      });
      if (!ok) return;
    }
    setter(!current);
    setDirty(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (state.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setState((s) => ({ ...s, tags: [...s.tags, t] }));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setState((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
  }

  async function handleSubmit() {
    if (!state.name.trim()) {
      setNameError("Obrigatório");
      toast.error("O nome do contato é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const id = contact
        ? (await updateContact({ id: contact.id, ...state }), contact.id)
        : await createContact(state);
      const saved = await getContact(id);
      const created: string[] = [];
      if (saved) {
        // Fornecedor
        if (alsoSupplier) {
          await upsertSupplierMirror(saved);
        } else if (hadMirror.supplier) {
          const res = await removeSupplierForContact(saved.id);
          if (!res.ok) toast.error(res.reason ?? "Não foi possível remover o fornecedor");
        }
        // Fã (perfil paralelo)
        if (alsoFan) {
          if (!hadMirror.fan) created.push("fã");
          await upsertFanMirror(saved);
        } else if (hadMirror.fan) {
          await removeFanForContact(saved.id);
        }
        // Aluno (perfil paralelo)
        if (alsoStudent) {
          if (!hadMirror.student) created.push("aluno");
          await upsertStudentMirror(saved);
        } else if (hadMirror.student) {
          await removeStudentForContact(saved.id);
        }
      }
      toast.success(
        created.length > 0
          ? `Pessoa salva — perfil de ${created.join(" e ")} criado`
          : contact
            ? "Contato atualizado"
            : "Contato criado"
      );
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contact ? "Editar pessoa" : "Nova pessoa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <AttachmentField
            label="Foto"
            value={state.photo_path}
            onChange={(v) => setState((s) => ({ ...s, photo_path: v }))}
            subdir="contacts"
            variant="image"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                autoFocus
                value={state.name}
                onChange={(e) => {
                  setState((s) => ({ ...s, name: e.target.value }));
                  if (nameError) setNameError(null);
                }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input
                placeholder="Nome da empresa / produtora…"
                value={state.company ?? ""}
                onChange={(e) => setState((s) => ({ ...s, company: e.target.value || null }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Relação</Label>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_RELATIONSHIP_TYPES.map((type) => {
                const active = (state.relationship_types ?? []).includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleRelType(type)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
                        : "border-input bg-background hover:bg-accent"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
              {(
                [
                  ["supplier", "Fornecedor", alsoSupplier],
                  ["fan", "Fã", alsoFan],
                  ["student", "Aluno", alsoStudent],
                ] as const
              ).map(([kind, label, active]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => void toggleParallel(kind)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition",
                    active
                      ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
                      : "border-input bg-background hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {(alsoFan || alsoStudent) && (
              <p className="text-xs text-muted-foreground">
                {alsoFan && alsoStudent
                  ? "Perfis paralelos de fã e aluno serão criados"
                  : alsoFan
                    ? "Um perfil paralelo de fã será criado"
                    : "Um perfil paralelo de aluno será criado"}
                {" "}ao salvar — editável no módulo correspondente.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Telefone">
              <Input
                value={state.phone ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, phone: e.target.value || null }))
                }
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={state.email ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, email: e.target.value || null }))
                }
              />
            </Field>
            <Field label="Redes sociais">
              <Input
                placeholder="@usuario"
                value={state.instagram ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, instagram: e.target.value || null }))
                }
              />
            </Field>
            <Field label="Cidade">
              <Input
                value={state.city ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, city: e.target.value || null }))
                }
              />
            </Field>
            <Field label="Aniversário">
              <Input
                type="date"
                value={state.birthday ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, birthday: e.target.value || null }))
                }
              />
            </Field>
          </div>

          {(state.types.includes("Dono de Club") || state.types.includes("Gerente de Club")) && venues.length > 0 && (
            <Field label="Venue vinculado">
              <Select
                value={state.venue_id ? String(state.venue_id) : "none"}
                onValueChange={(v) => setState((s) => ({ ...s, venue_id: v !== "none" ? Number(v) : null }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar venue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {state.types.includes("Influencer") && (
            <Field label="Seguidores (total)">
              <Input
                type="number"
                min={0}
                placeholder="Ex: 50000"
                value={state.follower_count ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, follower_count: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </Field>
          )}

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1">
              {state.tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1 pr-1">
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="rounded p-0.5 hover:bg-accent"
                    aria-label="Remover tag"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag (Enter para adicionar)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Adicionar
              </Button>
            </div>
          </div>

          <Field label="Notas">
            <Textarea
              rows={3}
              value={state.notes ?? ""}
              onChange={(e) =>
                setState((s) => ({ ...s, notes: e.target.value || null }))
              }
            />
          </Field>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={ratingToPriority(state.rating) ?? "none"}
              onValueChange={(v) =>
                setState((s) => ({
                  ...s,
                  rating:
                    v === "none" ? null : priorityToRating(v as ContactPriority),
                }))
              }
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Nenhum" />
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
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {contact ? "Salvar alterações" : "Criar pessoa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
