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
import { cn } from "@/lib/utils";
import { LevelBadge } from "../components/LevelBadge";
import { createFan, updateFan } from "../api";
import { FAN_LEVELS, type Fan, type FanCreateInput, type FanLevel } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fan?: Fan | null;
  onSaved: (id: number) => void;
};

const EMPTY: FanCreateInput = {
  name: "",
  level: "Possível fã",
  instagram: null,
  email: null,
  phone: null,
  city: null,
  tags: [],
  notes: null,
  photo_path: null,
};

function fanToState(f: Fan): FanCreateInput {
  return {
    name: f.name,
    level: f.level,
    instagram: f.instagram,
    email: f.email,
    phone: f.phone,
    city: f.city,
    tags: f.tags,
    notes: f.notes,
    photo_path: f.photo_path,
  };
}

export function FanForm({ open, onOpenChange, fan, onSaved }: Props) {
  const [state, setState] = useState<FanCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (fan) setState(fanToState(fan));
    else setState(EMPTY);
    setTagInput("");
    setNameError(null);
  }, [fan, open]);

  function addTag() {
    const t = tagInput.trim();
    if (!t || state.tags.includes(t)) {
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
      toast.error("O nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const id = fan
        ? (await updateFan({ id: fan.id, ...state }), fan.id)
        : await createFan(state);
      toast.success(fan ? "Fã atualizado" : "Fã criado");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{fan ? "Editar fã" : "Novo fã"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <AttachmentField
            label="Foto"
            value={state.photo_path}
            onChange={(v) => setState((s) => ({ ...s, photo_path: v }))}
            subdir="fans"
            variant="image"
          />

          <div className="space-y-1.5">
            <Label>
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              value={state.name}
              onChange={(e) => {
                setState((s) => ({ ...s, name: e.target.value }));
                if (nameError) setNameError(null);
              }}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Nível</Label>
            <div className="flex flex-wrap gap-1.5">
              {FAN_LEVELS.map((level) => {
                const active = state.level === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, level }))}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent"
                    )}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Atual: <LevelBadge level={state.level as FanLevel} />
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Instagram">
              <Input
                placeholder="@fan"
                value={state.instagram ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, instagram: e.target.value || null }))
                }
              />
            </Field>
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
            <Field label="Cidade">
              <Input
                value={state.city ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, city: e.target.value || null }))
                }
              />
            </Field>
          </div>

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
                    aria-label="Remover"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag (Enter)"
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
              placeholder="Como conheceu, gostos musicais, momento marcante…"
              value={state.notes ?? ""}
              onChange={(e) =>
                setState((s) => ({ ...s, notes: e.target.value || null }))
              }
            />
          </Field>
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
            {fan ? "Salvar alterações" : "Criar fã"}
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
