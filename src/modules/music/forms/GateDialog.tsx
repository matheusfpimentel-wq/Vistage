import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { loadIdentity } from "@/modules/identity/api";
import type { ArtistIdentity } from "@/modules/identity/types";
import {
  gateCriteriaComplete,
  type Gate,
  type GateCriteria,
  type GateDecisionRecord,
  type GateField,
} from "../gates";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gate: Gate;
  onDecide: (record: GateDecisionRecord) => void;
};

export function GateDialog({ open, onOpenChange, gate, onDecide }: Props) {
  const [criteria, setCriteria] = useState<GateCriteria>({});
  const [identity, setIdentity] = useState<ArtistIdentity | null>(null);

  useEffect(() => {
    if (!open) return;
    setCriteria({});
    if (gate.showIdentity) void loadIdentity().then(setIdentity);
  }, [open, gate]);

  function set(key: string, value: GateCriteria[string]) {
    setCriteria((c) => ({ ...c, [key]: value }));
  }

  function decide(decision: "approved" | "rejected") {
    if (!gateCriteriaComplete(gate, criteria)) {
      toast.error("Preencha todos os critérios antes de decidir.");
      return;
    }
    onDecide({
      gate_id: gate.id,
      decision,
      criteria,
      decided_at: new Date().toISOString(),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{gate.title}</DialogTitle>
          <DialogDescription>{gate.question}</DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid gap-4",
            gate.showIdentity && identity ? "sm:grid-cols-[1fr_180px]" : ""
          )}
        >
          <div className="space-y-4">
            {gate.fields.map((f) => (
              <GateFieldInput
                key={f.key}
                field={f}
                value={criteria[f.key] ?? null}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>

          {gate.showIdentity && identity && (
            <aside className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">
                Identidade artística
              </div>
              {identity.artist_name && (
                <div className="text-sm font-semibold">
                  {identity.artist_name}
                </div>
              )}
              {identity.bio_short && (
                <p className="text-xs text-muted-foreground">
                  {identity.bio_short}
                </p>
              )}
              {identity.palette.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {identity.palette.map((c, i) => (
                    <span
                      key={i}
                      title={c.label ?? c.hex}
                      className="h-6 w-6 rounded border"
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
          Reprovar não cancela: a track vai pra <strong>Stand-by</strong>{" "}
          (reativável). Evita decisões finais por impulso e o viés de sunk-cost.
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => decide("rejected")}>
            <X className="h-4 w-4" /> Reprovar → Stand-by
          </Button>
          <Button onClick={() => decide("approved")}>
            <Check className="h-4 w-4" /> Aprovar e avançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GateFieldInput({
  field,
  value,
  onChange,
}: {
  field: GateField;
  value: GateCriteria[string];
  onChange: (v: GateCriteria[string]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{field.label}</Label>
      {field.hint && (
        <p className="text-xs text-muted-foreground">{field.hint}</p>
      )}
      {field.type === "boolean" && (
        <ChipGroup
          options={["Sim", "Não"]}
          value={value === true ? "Sim" : value === false ? "Não" : null}
          onChange={(v) => onChange(v === "Sim")}
        />
      )}
      {field.type === "tri" && (
        <ChipGroup
          options={["Sim", "Parcial", "Não"]}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
        />
      )}
      {field.type === "scale" && (
        <ChipGroup
          options={["1", "2", "3", "4", "5"]}
          value={value != null ? String(value) : null}
          onChange={(v) => onChange(Number(v))}
        />
      )}
      {field.type === "select" && field.options && (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.type === "number" && (
        <Input
          type="number"
          min={0}
          value={value != null ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
        />
      )}
      {field.type === "text" && (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
    </div>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-md border px-3 py-1 text-sm transition",
            value === o
              ? "border-transparent bg-primary text-primary-foreground shadow-sm shadow-primary/30 ring-1 ring-inset ring-white/20"
              : "border-input hover:bg-accent"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
