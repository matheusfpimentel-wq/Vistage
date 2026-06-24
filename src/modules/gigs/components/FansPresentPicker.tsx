import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listFans } from "@/modules/fans/api";
import { FanForm } from "@/modules/fans/forms/FanForm";
import { LevelBadge } from "@/modules/fans/components/LevelBadge";
import type { Fan } from "@/modules/fans/types";
import { cn } from "@/lib/utils";

type Props = {
  value: number[];
  onChange: (next: number[]) => void;
};

/**
 * Picker multi-select de fãs presentes na GIG. Aparece no Debrief.
 * Mostra todos os fãs cadastrados; clica pra marcar/desmarcar.
 */
export function FansPresentPicker({ value, onChange }: Props) {
  const [fans, setFans] = useState<Fan[]>([]);
  const [search, setSearch] = useState("");
  const [fanFormOpen, setFanFormOpen] = useState(false);

  const loadFans = useCallback(() => listFans().then(setFans), []);
  useEffect(() => {
    void loadFans();
  }, [loadFans]);

  // Cadastra um fã novo (que não está na lista) e já o marca como presente.
  async function handleFanCreated(id: number) {
    await loadFans();
    if (!value.includes(id)) onChange([...value, id]);
  }

  const selected = useMemo(() => new Set(value), [value]);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return fans;
    const q = search.toLowerCase();
    return fans.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.instagram ?? "").toLowerCase().includes(q)
    );
  }, [fans, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-red-400" />
          Fãs presentes
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} marcado{selected.size !== 1 ? "s" : ""}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setFanFormOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Cadastrar fã
          </Button>
        </div>
      </div>

      {fans.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Cadastre fãs em <strong>/fas</strong> pra marcar quem veio na GIG.
        </div>
      ) : (
        <>
          {fans.length > 6 && (
            <Input
              placeholder="Buscar fã pelo nome ou @"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {value.map((id) => {
                const f = fans.find((x) => x.id === id);
                if (!f) return null;
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {f.name}
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-label="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          <div className="max-h-48 overflow-y-auto rounded-md border">
            {filtered.map((f) => {
              const checked = selected.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0",
                    checked ? "bg-primary/5" : "hover:bg-accent/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                        checked
                          ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
                          : "border-input"
                      )}
                    >
                      {checked && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 12 12"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span>{f.name}</span>
                  </div>
                  <LevelBadge level={f.level} />
                </button>
              );
            })}
          </div>
        </>
      )}

      <FanForm
        open={fanFormOpen}
        onOpenChange={setFanFormOpen}
        onSaved={(id) => void handleFanCreated(id)}
      />
    </div>
  );
}
