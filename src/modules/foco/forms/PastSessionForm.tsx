import { useEffect, useMemo, useState } from "react";
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
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StarRating } from "@/components/ui/star-rating";
import { toast } from "@/components/ui/toaster";
import { useUnsavedConfirm } from "@/lib/dirty";
import { toLocalISODate } from "@/lib/format";
import {
  ACTIVITY_TYPES,
  SessionRangeError,
  createPastSession,
  overlappingSessions,
  updateSession,
  validateSessionRange,
  type ActivityType,
  type WorkSession,
} from "../api";
import { ACTIVITY_CONTEXT, loadEntityOptions, type EntityOption } from "../sessionContext";

type FormState = {
  date: string;
  start: string;
  end: string;
  activity: ActivityType;
  contextId: string;
  energy: number | null;
  focus: number | null;
  notes: string;
};

/** "2026-08-02T20:30:00" a partir dos campos de data e hora (fuso LOCAL). */
function toIso(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/** Parte de data e de hora de um ISO, no fuso local, pra hidratar a edição. */
function fromIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: toLocalISODate(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function emptyState(): FormState {
  return {
    date: toLocalISODate(),
    start: "",
    end: "",
    activity: ACTIVITY_TYPES[0],
    contextId: "none",
    energy: null,
    focus: null,
    notes: "",
  };
}

/**
 * Registra uma sessão de foco PASSADA, ou edita uma já registrada — o
 * cronômetro cobria só o caso de ligar antes de começar, e não havia nenhuma
 * forma de corrigir uma sessão depois (só excluir).
 */
export function PastSessionForm({
  open,
  onOpenChange,
  session,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sessão a editar; null registra uma nova. */
  session: WorkSession | null;
  onSaved: () => void;
}) {
  const [state, setState] = useState<FormState>(emptyState);
  const [initial, setInitial] = useState<FormState>(emptyState);
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [overlaps, setOverlaps] = useState<WorkSession[]>([]);
  const [saving, setSaving] = useState(false);

  const contextType = ACTIVITY_CONTEXT[state.activity] ?? null;
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  const confirmClose = useUnsavedConfirm(dirty);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  useEffect(() => {
    if (!open) return;
    const base: FormState = session
      ? {
          ...fromIso(session.started_at),
          date: fromIso(session.started_at).date,
          start: fromIso(session.started_at).time,
          end: session.ended_at ? fromIso(session.ended_at).time : "",
          activity: session.activity_type,
          contextId: session.context_id ? String(session.context_id) : "none",
          energy: session.energy_level,
          focus: session.focus_level,
          notes: session.notes ?? "",
        }
      : emptyState();
    setState(base);
    setInitial(base);
    setOverlaps([]);
  }, [open, session]);

  // Opções de vínculo seguem a atividade, igual ao cronômetro.
  useEffect(() => {
    if (!contextType) {
      setOptions([]);
      return;
    }
    let active = true;
    void loadEntityOptions(contextType).then((o) => {
      if (active) setOptions(o);
    });
    return () => {
      active = false;
    };
  }, [contextType]);

  // Erro de intervalo, calculado enquanto digita (não só no salvar).
  const rangeError = useMemo(() => {
    if (!state.date || !state.start || !state.end) return null;
    try {
      validateSessionRange(toIso(state.date, state.start), toIso(state.date, state.end));
      return null;
    } catch (e) {
      return e instanceof SessionRangeError ? e.message : String(e);
    }
  }, [state.date, state.start, state.end]);

  const durationLabel = useMemo(() => {
    if (rangeError || !state.date || !state.start || !state.end) return null;
    const ms =
      Date.parse(toIso(state.date, state.end)) - Date.parse(toIso(state.date, state.start));
    const min = Math.round(ms / 60_000);
    const h = Math.floor(min / 60);
    return h > 0 ? `${h}h ${min % 60}min` : `${min}min`;
  }, [rangeError, state.date, state.start, state.end]);

  // Sobreposição é AVISO, não impedimento: tocar e gerenciar ao mesmo tempo
  // acontece. Consulta com debounce pra não bater no banco a cada tecla.
  useEffect(() => {
    if (rangeError || !state.date || !state.start || !state.end) {
      setOverlaps([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void overlappingSessions(
        toIso(state.date, state.start),
        toIso(state.date, state.end),
        session?.id
      )
        .then(setOverlaps)
        .catch(() => setOverlaps([]));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [rangeError, state.date, state.start, state.end, session?.id]);

  async function handleSubmit() {
    if (!state.date || !state.start || !state.end) {
      toast.error("Preencha a data, a hora de início e a de fim.");
      return;
    }
    if (rangeError) {
      toast.error(rangeError);
      return;
    }
    setSaving(true);
    try {
      const started_at = toIso(state.date, state.start);
      const ended_at = toIso(state.date, state.end);
      const ctxId = state.contextId === "none" ? null : Number(state.contextId);
      if (session) {
        await updateSession({
          id: session.id,
          activity_type: state.activity,
          started_at,
          ended_at,
          energy_level: state.energy,
          focus_level: state.focus,
          notes: state.notes.trim() || null,
        });
        toast.success("Sessão atualizada");
      } else {
        await createPastSession({
          activity_type: state.activity,
          started_at,
          ended_at,
          energy_level: state.energy,
          focus_level: state.focus,
          notes: state.notes.trim() || null,
          context_type: ctxId ? contextType : null,
          context_id: ctxId,
        });
        toast.success("Sessão registrada");
      }
      setInitial(state); // deixa de estar sujo antes de fechar
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof SessionRangeError ? e.message : `Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {session ? "Editar sessão" : "Registrar sessão passada"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                max={toLocalISODate()}
                value={state.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="time" value={state.start} onChange={(e) => set("start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="time" value={state.end} onChange={(e) => set("end", e.target.value)} />
            </div>
          </div>

          {rangeError ? (
            <p className="text-xs text-destructive">{rangeError}</p>
          ) : durationLabel ? (
            <p className="text-xs text-muted-foreground tabular-nums">Duração: {durationLabel}</p>
          ) : null}

          {overlaps.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Já existe {overlaps.length === 1 ? "uma sessão" : `${overlaps.length} sessões`} nesse
              intervalo ({overlaps.map((o) => o.activity_type).join(", ")}). Dá pra salvar mesmo
              assim.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <Select
                value={state.activity}
                onValueChange={(v) => {
                  set("activity", v as ActivityType);
                  set("contextId", "none"); // o vínculo depende da atividade
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!session && contextType && options.length > 0 && (
              <div className="space-y-1.5">
                <Label>Vínculo</Label>
                <Select value={state.contextId} onValueChange={(v) => set("contextId", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Energia</Label>
              <StarRating
                value={state.energy}
                onChange={(v) => set("energy", v)}
                size="h-5 w-5"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Foco</Label>
              <StarRating value={state.focus} onChange={(v) => set("focus", v)} size="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <AutoGrowTextarea
              rows={2}
              value={state.notes}
              onChange={(v) => set("notes", v)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => confirmClose(false, () => onOpenChange(false))}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !!rangeError}>
            {session ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
