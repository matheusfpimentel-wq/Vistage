import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { cn } from "@/lib/utils";
import { LevelBadge } from "../components/LevelBadge";
import { FAN_LEVELS, type FanCreateInput, type FanLevel } from "../types";
import type { Contact } from "@/modules/crm/types";

/**
 * Campos editáveis de um fã — compartilhados entre o form de criação e a aba
 * "Informações" do detalhe (que agora edita direto, sem passo separado).
 */
export function FanFields({
  state,
  setState,
  contacts,
  nameError,
  clearNameError,
}: {
  state: FanCreateInput;
  setState: (updater: (prev: FanCreateInput) => FanCreateInput) => void;
  contacts: Contact[];
  nameError?: string | null;
  clearNameError?: () => void;
}) {
  const [tagInput, setTagInput] = useState("");

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

  return (
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
            clearNameError?.();
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
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    level,
                    is_ambassador: level === "Embaixador" ? 1 : 0,
                  }))
                }
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
        <p className="text-xs text-muted-foreground">
          Possível fã → Superfã são calculados pela pontuação.{" "}
          <strong>Embaixador</strong> é um destaque manual (imune ao recálculo).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Instagram">
          <Input
            placeholder="@fan"
            value={state.instagram ?? ""}
            onChange={(e) => setState((s) => ({ ...s, instagram: e.target.value || null }))}
          />
        </Field>
        <Field label="Telefone">
          <Input
            value={state.phone ?? ""}
            onChange={(e) => setState((s) => ({ ...s, phone: e.target.value || null }))}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={state.email ?? ""}
            onChange={(e) => setState((s) => ({ ...s, email: e.target.value || null }))}
          />
        </Field>
        <Field label="Cidade">
          <Input
            value={state.city ?? ""}
            onChange={(e) => setState((s) => ({ ...s, city: e.target.value || null }))}
          />
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label>Vincular a contato (CRM)</Label>
        <Select
          value={state.contact_id != null ? String(state.contact_id) : "none"}
          onValueChange={(v) =>
            setState((s) => ({ ...s, contact_id: v === "none" ? null : Number(v) }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Nenhum contato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum contato</SelectItem>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value || null }))}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
