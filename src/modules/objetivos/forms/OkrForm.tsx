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
  updateOkrGcalEventId,
  type KeyResult,
  type Okr,
} from "../api";
import { loadAuth, pushOkrToCalendar } from "@/lib/gcal";
import { useUnsavedConfirm } from "@/lib/dirty";

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

// Quebra "YYYY-Qn" em ano e trimestre.
function splitQuarter(q: string): { year: string; q: string } {
  const m = /^(\d{4})-Q([1-4])$/.exec(q);
  if (m) return { year: m[1], q: m[2] };
  const now = new Date();
  return { year: String(now.getFullYear()), q: String(Math.ceil((now.getMonth() + 1) / 3)) };
}

const QUARTERS = [
  { value: "1", label: "Q1 · jan–mar" },
  { value: "2", label: "Q2 · abr–jun" },
  { value: "3", label: "Q3 · jul–set" },
  { value: "4", label: "Q4 · out–dez" },
];

export function OkrForm({ open, onOpenChange, okr, onSaved }: Props) {
  const initial = splitQuarter(currentQuarter());
  const [year, setYear] = useState(initial.year);
  const [quarterNum, setQuarterNum] = useState(initial.q);
  const [objective, setObjective] = useState("");
  const [krs, setKrs] = useState<KeyResult[]>([newKr()]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  const quarter = `${year}-Q${quarterNum}`;

  // anos: do atual -1 até +3
  const baseYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 5 }, (_, i) => String(baseYear - 1 + i));

  useEffect(() => {
    if (okr) {
      const s = splitQuarter(okr.quarter);
      setYear(s.year);
      setQuarterNum(s.q);
      setObjective(okr.objective);
      setKrs(okr.key_results.length > 0 ? okr.key_results : [newKr()]);
    } else {
      const s = splitQuarter(currentQuarter());
      setYear(s.year);
      setQuarterNum(s.q);
      setObjective("");
      setKrs([newKr()]);
    }
    setDirty(false);
  }, [okr, open]);

  function updateKr<K extends keyof KeyResult>(idx: number, key: K, value: KeyResult[K]) {
    setKrs((prev) => prev.map((kr, i) => i === idx ? { ...kr, [key]: value } : kr));
    setDirty(true);
  }

  async function handleSave() {
    if (!objective.trim()) { toast.error("Objetivo obrigatório"); return; }
    const validKrs = krs.filter((kr) => kr.description.trim());
    setSaving(true);
    try {
      let savedId: number | null = null;
      if (okr) {
        await updateOkr({ id: okr.id, quarter, objective, key_results: validKrs });
        savedId = okr.id;
        toast.success("OKR atualizado");
      } else {
        savedId = await createOkr({ quarter, objective, key_results: validKrs });
        toast.success("OKR criado");
      }
      // Sync com Google Calendar
      try {
        const auth = await loadAuth();
        if (auth?.access_token && auth.calendar_id && savedId !== null) {
          const gcalEventId = okr?.gcal_event_id ?? null;
          const eventId = await pushOkrToCalendar({
            id: savedId,
            quarter,
            objective,
            gcal_event_id: gcalEventId,
          });
          if (!gcalEventId) {
            await updateOkrGcalEventId(savedId, eventId);
          }
        }
      } catch {
        // falha no calendário não bloqueia o save
      }
      setDirty(false);
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{okr ? "Editar OKR" : "Novo OKR"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={year} onValueChange={(v) => { setYear(v); setDirty(true); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trimestre</Label>
              <Select value={quarterNum} onValueChange={(v) => { setQuarterNum(v); setDirty(true); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUARTERS.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Objetivo <span className="text-destructive">*</span></Label>
            <Input
              value={objective}
              onChange={(e) => { setObjective(e.target.value); setDirty(true); }}
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
                onClick={() => { setKrs((prev) => [...prev, newKr()]); setDirty(true); }}
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
                    aria-label="Excluir KR"
                    onClick={() => { setKrs((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}
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
