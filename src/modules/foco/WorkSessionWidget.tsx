import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type WorkSession,
  endSession,
  getActiveSession,
  startSession,
} from "./api";
import { closeSessionOverlay, openSessionOverlay } from "./overlay";
import { DATA_CHANGED } from "@/lib/events";
import { listTracks } from "@/modules/music/api";
import { listGigs } from "@/modules/gigs/api";
import { listContent } from "@/modules/content/api";
import { listTasks } from "@/modules/tasks/api";
import { listClasses } from "@/modules/classes/api";
import { listParties } from "@/modules/parties/api";

type EntityOption = { id: number; name: string };

const ACTIVITY_CONTEXT: Record<string, string> = {
  "Tempo de palco": "gig",
  "Criação musical": "track",
  Aulas: "class",
  "Produção de festa": "party",
};

async function loadEntityOptions(type: string): Promise<EntityOption[]> {
  switch (type) {
    case "class": {
      const rows = await listClasses();
      return rows.map((c) => ({
        id: c.id,
        name: `${c.student_name} · ${c.date}`,
      }));
    }
    case "party": {
      const rows = await listParties();
      return rows.map((p) => ({ id: p.id, name: p.title }));
    }
    case "track": {
      const rows = await listTracks();
      return rows.map((t) => ({
        id: t.id,
        name: (t.title_final && t.title_final.trim()) || t.title_working,
      }));
    }
    case "gig": {
      const rows = await listGigs();
      return rows.map((g) => ({
        id: g.id,
        name: (g.event_name && g.event_name.trim()) || g.venue_name || `GIG #${g.id}`,
      }));
    }
    case "content": {
      const rows = await listContent();
      return rows.map((c) => ({ id: c.id, name: c.title }));
    }
    case "task": {
      const rows = await listTasks();
      return rows.map((t) => ({ id: t.id, name: t.title }));
    }
    default:
      return [];
  }
}

function formatSecs(total: number): string {
  const clamped = Math.max(0, total);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function WorkSessionWidget() {
  const [session, setSession] = useState<WorkSession | null>(null);
  const [timer, setTimer] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("Criação musical");
  const [energy, setEnergy] = useState(3);
  const [focus, setFocus] = useState(3);
  const [notes, setNotes] = useState("");
  const [context, setContext] = useState("");
  const [contextType, setContextType] = useState("none");
  const [contextId, setContextId] = useState("none");
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [startContextType, setStartContextType] = useState<string | null>(null);
  const [startContextId, setStartContextId] = useState("none");
  const [startEntityOptions, setStartEntityOptions] = useState<EntityOption[]>([]);
  const [plannedMinutes, setPlannedMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseMsRef = useRef(0);
  const pausedSinceRef = useRef<number | null>(null);
  const sessionRef = useRef<WorkSession | null>(null);
  const [paused, setPaused] = useState(false);

  // Recalcula o cronômetro descontando o tempo pausado. Se estiver pausado
  // agora, congela no instante da pausa em vez de continuar correndo.
  const recomputeTimer = useCallback(() => {
    const s = sessionRef.current;
    if (!s) { setTimer(""); return; }
    const startMs = new Date(s.started_at).getTime();
    const end = pausedSinceRef.current ?? Date.now();
    setTimer(formatSecs(Math.floor((end - startMs - pauseMsRef.current) / 1000)));
  }, []);

  const booted = useRef(false);
  const refresh = useCallback(async (openOverlay = false) => {
    const s = await getActiveSession();
    setSession(s);
    // Reabre a mini-janela apenas no boot (quando o app é reaberto com sessão ativa).
    if (openOverlay && s) void openSessionOverlay(s);
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // On boot: restore overlay if a session was already active.
    void refresh(true);
    // Sync session state on data changes but don't re-open the overlay.
    const onChange = () => void refresh(false);
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ paused?: boolean; pauseMs: number }>("work-session-pause", (e) => {
          pauseMsRef.current = e.payload?.pauseMs ?? 0;
          const isPaused = e.payload?.paused ?? false;
          pausedSinceRef.current = isPaused ? Date.now() : null;
          setPaused(isPaused);
          recomputeTimer();
        });
      } catch { /* ignore */ }
    })();
    return () => { if (unlisten) unlisten(); };
  }, [recomputeTimer]);

  // A mini-janela avisa quando o tempo previsto vence — mostramos um toast na
  // janela principal também (a sessão NUNCA encerra sozinha).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ activity?: string }>("work-session-expired", (e) => {
          toast.warning(
            `⏰ Tempo previsto atingido${e.payload?.activity ? ` (${e.payload.activity})` : ""} — continue ou encerre.`
          );
        });
      } catch { /* ignore */ }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    if (session) {
      recomputeTimer();
      intervalRef.current = setInterval(recomputeTimer, 1000);
    } else {
      setTimer("");
      pausedSinceRef.current = null;
      setPaused(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session, recomputeTimer]);

  useEffect(() => {
    const ctxType = ACTIVITY_CONTEXT[activityType] ?? null;
    setStartContextType(ctxType);
    setStartContextId("none");
    if (!ctxType) {
      setStartEntityOptions([]);
      return;
    }
    let active = true;
    void loadEntityOptions(ctxType).then((opts) => {
      if (active) setStartEntityOptions(opts);
    });
    return () => {
      active = false;
    };
  }, [activityType]);

  async function handleStart() {
    setSaving(true);
    try {
      pauseMsRef.current = 0;
      pausedSinceRef.current = null;
      setPaused(false);
      const ctxType = startContextType;
      const ctxId = startContextId === "none" ? null : Number(startContextId);
      const pm = Number(plannedMinutes);
      const planned = plannedMinutes.trim() && !isNaN(pm) && pm > 0 ? Math.round(pm) : null;
      const id = await startSession(activityType, ctxId ? ctxType : null, ctxId, planned);
      const fresh = await getActiveSession();
      setSession(fresh);
      if (fresh) void openSessionOverlay(fresh);
      else if (id) void openSessionOverlay({
        id,
        started_at: new Date().toISOString(),
        ended_at: null,
        activity_type: activityType,
        energy_level: null,
        focus_level: null,
        notes: null,
        context: null,
        context_type: null,
        context_id: null,
        pause_ms: 0,
        planned_minutes: planned,
        created_at: new Date().toISOString(),
      });
      setStartOpen(false);
      setPlannedMinutes("");
      toast.success(`Sessão iniciada: ${activityType}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (contextType === "none") {
      setEntityOptions([]);
      setContextId("none");
      return;
    }
    let active = true;
    void loadEntityOptions(contextType).then((opts) => {
      if (active) setEntityOptions(opts);
    });
    setContextId("none");
    return () => {
      active = false;
    };
  }, [contextType]);

  async function handleEnd() {
    if (!session) return;
    setSaving(true);
    try {
      const ctxType = contextType === "none" ? null : contextType;
      const ctxId = contextId === "none" ? null : Number(contextId);
      await endSession(
        session.id,
        energy,
        focus,
        notes || null,
        context || null,
        ctxType,
        ctxType ? ctxId : null,
        pauseMsRef.current
      );
      void closeSessionOverlay();
      setSession(null);
      setEndOpen(false);
      setNotes("");
      setContext("");
      setContextType("none");
      setContextId("none");
      setEnergy(3);
      setFocus(3);
      toast.success("Sessão encerrada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {session ? (
          <>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary tabular-nums">
              <span className={cn("h-1.5 w-1.5 rounded-full bg-primary", !paused && "animate-pulse")} />
              {session.activity_type.split(" ")[0]} · {timer}{paused && " (pausado)"}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Reabrir mini-janela" onClick={() => void openSessionOverlay(session)} title="Reabrir mini-janela">
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setEndOpen(true)}
            >
              <Square className="h-3 w-3" />
              <span className="hidden sm:inline">Encerrar</span>
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setStartOpen(true)}
          >
            <Play className="h-3 w-3" />
            <span className="hidden sm:inline">Sessão</span>
          </Button>
        )}

      </div>

      {/* Start dialog */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Iniciar sessão de trabalho</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de atividade</Label>
              <Select
                value={activityType}
                onValueChange={(v) => setActivityType(v as ActivityType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {startContextType && startEntityOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label>Vincular a…</Label>
                <Select value={startContextId} onValueChange={setStartContextId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {startEntityOptions.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Tempo previsto (opcional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="ex: 45"
                  value={plannedMinutes}
                  onChange={(e) => setPlannedMinutes(e.target.value)}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O anel enche conforme o tempo. Ao vencer, só avisa — nunca encerra sozinho.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancelar</Button>
            <Button onClick={handleStart} disabled={saving}>
              <Play className="h-4 w-4" /> Iniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End dialog */}
      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Encerrar sessão — {session?.activity_type}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <RatingRow
              label="Nível de energia"
              value={energy}
              onChange={setEnergy}
            />
            <RatingRow
              label="Nível de foco"
              value={focus}
              onChange={setFocus}
            />
            <div className="space-y-1.5">
              <Label>Observações (opcional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="O que rolou? O que travou?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contexto (opcional)</Label>
              <Textarea
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Ex: projeto, GIG, faixa específica…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trabalhei em (opcional)</Label>
              <Select value={contextType} onValueChange={setContextType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="track">Track</SelectItem>
                  <SelectItem value="gig">GIG</SelectItem>
                  <SelectItem value="content">Conteúdo</SelectItem>
                  <SelectItem value="task">Tarefa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {contextType !== "none" && (
              <div className="space-y-1.5">
                <Label>Item</Label>
                <Select value={contextId} onValueChange={setContextId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {entityOptions.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>Cancelar</Button>
            <Button onClick={handleEnd} disabled={saving}>
              <Square className="h-4 w-4" /> Encerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}: <span className="font-semibold text-primary">{value}</span>/5</Label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "flex-1 rounded border py-1 text-xs transition",
              value >= n
                ? "border-primary bg-primary/20 text-primary"
                : "border-input hover:bg-accent"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
