import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContentSceneInput } from "../types";

type Props = {
  scenes: ContentSceneInput[];
  onChange: (scenes: ContentSceneInput[]) => void;
};

const EMPTY_SCENE: ContentSceneInput = {
  title: null,
  description: null,
  equipment: [],
  materials: [],
  scenery: null,
};

export function SceneEditor({ scenes, onChange }: Props) {
  function update(index: number, patch: Partial<ContentSceneInput>) {
    onChange(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function remove(index: number) {
    onChange(scenes.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    onChange(next);
  }

  function add() {
    onChange([...scenes, { ...EMPTY_SCENE }]);
  }

  return (
    <div className="space-y-3">
      {scenes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma cena. Divida o roteiro em cenas com equipamento, materiais e
          cenário.
        </p>
      )}

      {scenes.map((scene, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              Cena {i + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={i === scenes.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título da cena</Label>
            <Input
              value={scene.title ?? ""}
              onChange={(e) => update(i, { title: e.target.value || null })}
              placeholder="Título da cena"
            />
          </div>

          <div className="space-y-1.5">
            <Label>O que acontece</Label>
            <Textarea
              rows={3}
              value={scene.description ?? ""}
              onChange={(e) =>
                update(i, { description: e.target.value || null })
              }
              placeholder="O que acontece"
            />
          </div>

          <TagInput
            label="Equipamento"
            placeholder="Adicionar equipamento…"
            values={scene.equipment}
            onChange={(equipment) => update(i, { equipment })}
          />

          <TagInput
            label="Materiais"
            placeholder="Adicionar material…"
            values={scene.materials}
            onChange={(materials) => update(i, { materials })}
          />

          <div className="space-y-1.5">
            <Label>Cenário</Label>
            <Input
              value={scene.scenery ?? ""}
              onChange={(e) => update(i, { scenery: e.target.value || null })}
              placeholder="Cenário"
            />
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        Adicionar cena
      </Button>
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (!values.includes(t)) onChange([...values, t]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== t))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
        }}
        placeholder={placeholder}
        className="h-8"
      />
    </div>
  );
}
