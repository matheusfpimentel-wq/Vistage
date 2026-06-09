import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
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
  CONTACT_TYPES,
  priorityToRating,
  ratingToPriority,
  type Contact,
  type ContactCreateInput,
  type ContactPriority,
  type ContactType,
} from "../types";
import {
  createContact,
  getContact,
  getMirrorState,
  updateContact,
  upsertStudentMirror,
  upsertSupplierMirror,
} from "../api";
import { sortContactTypes } from "../components/TypeBadges";
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
};

function contactToState(c: Contact): FormState {
  return {
    name: c.name,
    types: c.types,
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
  };
}

export function ContactForm({ open, onOpenChange, contact, onSaved }: Props) {
  const [state, setStateRaw] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);
  const [venues, setVenues] = useState<{ id: number; name: string }[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [alsoSupplier, setAlsoSupplier] = useState(false);
  const [alsoStudent, setAlsoStudent] = useState(false);
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
    setCustomTypeInput("");
    setShowCustomTypeInput(false);
    setNameError(null);
    setAlsoSupplier(false);
    setAlsoStudent(false);
    if (contact) {
      void getMirrorState(contact.id).then((m) => {
        setAlsoSupplier(m.supplier);
        setAlsoStudent(m.student);
      });
    }
    setDirty(false);
  }, [contact, open]);

  function toggleType(type: ContactType) {
    setState((s) => ({
      ...s,
      types: sortContactTypes(
        s.types.includes(type) ? s.types.filter((t) => t !== type) : [...s.types, type]
      ),
    }));
  }

  function addCustomType() {
    const t = customTypeInput.trim();
    if (!t) return;
    if (!state.types.includes(t)) {
      setState((s) => ({ ...s, types: sortContactTypes([...s.types, t]) }));
    }
    setCustomTypeInput("");
    setShowCustomTypeInput(false);
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
      if (alsoSupplier || alsoStudent) {
        const saved = await getContact(id);
        if (saved) {
          if (alsoSupplier) await upsertSupplierMirror(saved);
          if (alsoStudent) await upsertStudentMirror(saved);
        }
      }
      toast.success(contact ? "Contato atualizado" : "Contato criado");
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
          <DialogTitle>{contact ? "Editar contato" : "Novo contato"}</DialogTitle>
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
            <Label>Tipo (selecione um ou mais)</Label>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_TYPES.map((type) => {
                const active = state.types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
              {state.types.filter((t) => !CONTACT_TYPES.includes(t as (typeof CONTACT_TYPES)[number])).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className="rounded-md border border-primary bg-primary px-2.5 py-1 text-xs text-primary-foreground transition"
                >
                  {t} <X className="inline h-3 w-3 ml-1" />
                </button>
              ))}
              {showCustomTypeInput ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    className="h-7 w-28 text-xs"
                    placeholder="Novo tipo"
                    value={customTypeInput}
                    onChange={(e) => setCustomTypeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addCustomType(); }
                      if (e.key === "Escape") { setShowCustomTypeInput(false); setCustomTypeInput(""); }
                    }}
                  />
                  <Button type="button" size="sm" className="h-7 text-xs px-2" onClick={addCustomType}>OK</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomTypeInput(true)}
                  className="rounded-md border border-dashed border-input bg-background px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent"
                >
                  <Plus className="inline h-3 w-3 mr-0.5" />
                  Outro
                </button>
              )}
            </div>
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
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem prioridade —</SelectItem>
                {CONTACT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <Label>Também é</Label>
            <p className="text-xs text-muted-foreground">
              Cria uma persona espelho com os dados deste contato. Desmarcar não
              remove o registro já existente.
            </p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={alsoSupplier}
                onChange={(e) => {
                  setAlsoSupplier(e.target.checked);
                  setDirty(true);
                }}
                className="h-4 w-4"
              />
              <span className="text-sm">Também fornecedor</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={alsoStudent}
                onChange={(e) => {
                  setAlsoStudent(e.target.checked);
                  setDirty(true);
                }}
                className="h-4 w-4"
              />
              <span className="text-sm">Também aluno</span>
            </label>
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
            {contact ? "Salvar alterações" : "Criar contato"}
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
