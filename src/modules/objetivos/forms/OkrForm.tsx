import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  createOkr,
  currentQuarter,
  updateOkr,
  type KeyResult,
  type Okr,
} from "../api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  okr?: Okr | null;
  onSaved: () => void;
};

const METRIC_SOURCES: { value: KeyResult["metric_source"]; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "finance_revenue", label: "Receita (R$) — auto" },
  { value: "gigs_completed", label: "GIGs concluídas — auto" },
  { value: "tracks_released", label: "Tracks lançadas — auto" },
  { value: "parties_executed", label: "Festas realizadas — auto" },
  { value: "content_published", label: "Conteúdos publicados — auto" },
];

function newKr(): KeyResult {
  return {
    id: crypto.randomUUID(),
    description: "",
    metric_source: "manual",
    target: 0,
    unit: "",
    current: 0,
  };
}

export function OkrForm({ open, onOpenChange, okr, onSaved }: Props) {
  const [quarter, setQuarter] = useState(currentQuarter());
  const [objective, setObjective] = useState("");
  const [krs, setKrs] = useState<KeyResult[]>([newKr()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (okr) {
      setQuarter(okr.quarter);
      setObjective(okr.objective);
      setKrs(okr.key_results.length > 0 ? okr.key_results : [newKr()]);
    } else {
      setQuarter(currentQuarter());
      setObjective("");
      setKrs([newKr()]);
    }
  }, [okr, open]);

  function updateKr<K extends keyof KeyResult>(idx: number, key: K, value: KeyResult[K]) {
    setKrs((prev) => prev.map((kr, i) => i === idx ? { ...kr, [key]: value } : kr));
  }

  async function handleSave() {
    if (!objective.trim()) { toast.error("Objetivo obrigatório"); return; }
    const validKrs = krs.filter((kr) => kr.description.trim());
    setSaving(true);
    try {
      if (okr) {
        await updateOkr({ id: okr.id, quarter, objective, key_results: validKrs });
        toast.success("OKR atualizado");
      } else {
        await createOkr({ quarter, objective, key_results: validKrs });
        toast.success("OKR criado");
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{okr ? "Editar OKR" : "Novo OKR"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Trimestre</Label>
              <Input
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                placeholder="2026-Q3"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Objetivo <span className="text-destructive">*</span></Label>
            <Input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex: Fortalecer minha presença no mercado nacional"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Key Results</Label>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setKrs((prev) => [...prev, newKr()])}
                disabled={krs.length >= 5}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar KR
              </Button>
            </div>

            {krs.map((kr, i) => (
              <div key={kr.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">KR {i + 1}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto h-6 w-6"
                    onClick={() => setKrs((prev) => prev.filter((_, j) => j !== i))}
                    disabled={krs.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <Input
                  placeholder="Descrição do key result"
                  value={kr.description}
                  onChange={(e) => updateKr(i, "description", e.target.value)}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Fonte</Label>
                    <Select
                      value={kr.metric_source}
                      onValueChange={(v) => updateKr(i, "metric_source", v as KeyResult["metric_source"])}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METRIC_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value} className="text-xs">
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Meta</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={kr.target}
                      onChange={(e) => updateKr(i, "target", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unidade</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="GIGs, R$, posts…"
                      value={kr.unit}
                      onChange={(e) => updateKr(i, "unit", e.target.value)}
                    />
                  </div>
                </div>
                {kr.metric_source === "manual" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Atual</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={kr.current}
                      onChange={(e) => updateKr(i, "current", Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {okr ? "Salvar alterações" : "Criar OKR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
