import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Badge } from "@/components/ui/badge";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { cn } from "@/lib/utils";
import { LevelBadge } from "../components/LevelBadge";
import { FAN_LEVELS, type FanCreateInput, type FanLevel } from "../types";

/**
 * Campos editáveis de um fã — compartilhados entre o form de criação e a aba
 * "Informações" do detalhe (que agora edita direto, sem passo separado).
 *
 * Layout aproximado do de Contato (§1.1): foto pequena/quadrada + nome/Instagram/
 * telefone no cabeçalho; Origem e Tags na mesma linha; Notas em auto-grow.
 */
export function FanFields({
  state,
  setState,
  fanOptions,
  nameError,
  clearNameError,
}: {
  state: FanCreateInput;
  setState: (updater: (prev: FanCreateInput) => FanCreateInput) => void;
  /** Fãs para o seletor "Indicado por:" (já sem o próprio fã, quando editando). */
  fanOptions: { id: number; name: string }[];
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
      {/* Cabeçalho estilo Contato: foto pequena/quadrada + nome/Instagram/telefone */}
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0 sm:w-28">
          <AttachmentField
            label="Foto"
            value={state.photo_path}
            onChange={(v) => setState((s) => ({ ...s, photo_path: v }))}
            subdir="fans"
            variant="image"
            square
          />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
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
          </div>
        </div>
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
                    ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
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

      {/* Origem e Tags na mesma linha (§1.1). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Origem">
          <Input
            placeholder="Como chegou (show, indicação, Instagram…)"
            value={state.origem ?? ""}
            onChange={(e) => setState((s) => ({ ...s, origem: e.target.value || null }))}
          />
        </Field>
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <div className="flex flex-wrap items-center gap-1">
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
              className="h-7 w-28 flex-1 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Indicado por: seletor de fã — alimenta o sinal de Indicação (§1.4). */}
      <Field label="Indicado por">
        <Select
          value={state.indicated_by_fan_id != null ? String(state.indicated_by_fan_id) : "none"}
          onValueChange={(v) =>
            setState((s) => ({ ...s, indicated_by_fan_id: v === "none" ? null : Number(v) }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Ninguém" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ninguém</SelectItem>
            {fanOptions.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Notas">
        <AutoGrowTextarea
          rows={2}
          placeholder="Como conheceu, gostos musicais, momento marcante…"
          value={state.notes ?? ""}
          onChange={(v) => setState((s) => ({ ...s, notes: v || null }))}
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
