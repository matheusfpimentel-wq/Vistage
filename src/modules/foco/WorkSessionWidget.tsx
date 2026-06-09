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

type EntityOption = { id: number; name: string };

async function loadEntityOptions(type: string): Promise<EntityOption[]> {
  switch (type) {
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

function elapsed(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
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
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const s = await getActiveSession();
    setSession(s);
    // Reabre a mini-janela se houver sessão ativa (ex.: app reaberto).
    if (s) void openSessionOverlay(s);
  }, []);

  useEffect(() => {
    void refresh();
    // Sincroniza com sessões iniciadas fora deste widget (ex: FocoPage)
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [refresh]);

  useEffect(() => {
    if (session) {
      const tick = () => setTimer(elapsed(session.started_at));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setTimer("");
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);

  async function handleStart() {
    setSaving(true);
    try {
      const id = await startSession(activityType);
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
        created_at: new Date().toISOString(),
      });
      setStartOpen(false);
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
        ctxType ? ctxId : null
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
      toast.success("Sessão encerrada e dados salvos!");
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
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {session.activity_type.split(" ")[0]} · {timer}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void openSessionOverlay(session)} title="Reabrir mini-janela">
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
