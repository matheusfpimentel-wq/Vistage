import { useEffect, useRef, useState } from "react";
import { Check, ListChecks, Plus, Timer } from "lucide-react";
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
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { createIdea, createTaskFromIdea, updateIdea } from "../api";
import { IDEA_HEATS, heatColor, heatLabel, type IdeaHeat } from "../types";

type Phase = "setup" | "diverge" | "converge";
type Captured = { id: number; title: string; heat: IdeaHeat; asTask: boolean };

const DURATIONS = [3, 5, 10] as const;

/**
 * Modo Sessão (§6): separa GERAR de JULGAR. Base sólida (Osborn-Parnes; e
 * brainwriting — gerar por escrito, sozinho, rende mais que brainstorm falado).
 * Diverge: sprint com meta e cronômetro, captura sem julgar (tudo entra frio).
 * Converge: depois, marca o Calor das que valem e vira tarefa.
 */
export function IdeaSessionDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [goal, setGoal] = useState("");
  const [durationMin, setDurationMin] = useState<number>(3);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [captured, setCaptured] = useState<Captured[]>([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("setup");
    setGoal("");
    setDurationMin(3);
    setSecondsLeft(0);
    setCaptured([]);
    setDraft("");
  }, [open]);

  // Cronômetro da fase diverge — ao zerar, passa pra convergir. Gated em `open`:
  // o diálogo não desmonta ao fechar, então sem isso o timer seguiria contando
  // (e até virando convergir) com a janela fechada.
  useEffect(() => {
    if (!open || phase !== "diverge") return;
    if (secondsLeft <= 0) {
      setPhase("converge");
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [open, phase, secondsLeft]);

  function start() {
    setSecondsLeft(durationMin * 60);
    setPhase("diverge");
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function capture() {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    try {
      const id = await createIdea({
        title: t,
        body: null,
        category: null,
        tags: ["sessão"],
        heat: 1, // frio: nada é julgado durante a geração
        maturation: "Embrião",
        converted_to: null,
        converted_id: null,
      });
      setCaptured((c) => [{ id, title: t, heat: 1, asTask: false }, ...c]);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
    inputRef.current?.focus();
  }

  async function setHeat(id: number, heat: IdeaHeat) {
    setCaptured((c) => c.map((x) => (x.id === id ? { ...x, heat } : x)));
    try {
      await updateIdea({ id, heat });
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function toTask(item: Captured) {
    try {
      await createTaskFromIdea(item);
      setCaptured((c) => c.map((x) => (x.id === item.id ? { ...x, asTask: true } : x)));
      toast.success(`Tarefa criada: ${item.title}`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  function finish() {
    onDone();
    onOpenChange(false);
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timeStr = `${mm}:${String(ss).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" /> Sessão de ideias
          </DialogTitle>
        </DialogHeader>

        {phase === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gere sem julgar: solte o máximo de ideias antes do tempo acabar. Depois você decide
              quais valem. (Brainwriting sozinho costuma render mais que brainstorm falado.)
            </p>
            <div className="space-y-1.5">
              <Label>Meta da sessão</Label>
              <Input
                autoFocus
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ex.: 5 ideias de conteúdo em 3 min"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tempo</Label>
              <div className="flex gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationMin(d)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition",
                      durationMin === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={start} className="w-full">
              <Timer className="h-4 w-4" /> Começar
            </Button>
          </div>
        )}

        {phase === "diverge" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {goal ? (
                <span className="truncate text-sm text-muted-foreground">{goal}</span>
              ) : (
                <span className="text-sm text-muted-foreground">Solta o que vier.</span>
              )}
              <span
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 font-mono text-sm font-semibold",
                  secondsLeft <= 10
                    ? "bg-red-500/15 text-red-500"
                    : "bg-primary/10 text-primary"
                )}
              >
                {timeStr}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void capture();
                  }
                }}
                placeholder="Uma ideia (Enter), sem julgar"
              />
              <Button type="button" variant="outline" onClick={() => void capture()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {captured.length} {captured.length === 1 ? "ideia" : "ideias"} nesta sessão
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhase("converge")}>
                Terminar agora
              </Button>
            </div>
            {captured.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {captured.map((c) => (
                  <div key={c.id} className="rounded-md border bg-card/60 px-3 py-1.5 text-sm">
                    {c.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "converge" && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">Tempo!</span>{" "}
              <span className="text-muted-foreground">
                Agora julgue: marque o Calor das que valem, vire tarefa, ou deixe esfriar.
              </span>
            </p>
            {captured.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nada capturado nesta sessão.
              </p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {captured.map((c) => (
                  <div key={c.id} className="space-y-1.5 rounded-md border p-2.5">
                    <div className="text-sm font-medium">{c.title}</div>
                    <div className="flex flex-wrap items-center gap-1">
                      {IDEA_HEATS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => void setHeat(c.id, h)}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] transition",
                            c.heat === h ? heatColor(h) : "border-input hover:bg-accent"
                          )}
                        >
                          {heatLabel(h)}
                        </button>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7"
                        disabled={c.asTask}
                        onClick={() => void toTask(c)}
                      >
                        {c.asTask ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Tarefa
                          </>
                        ) : (
                          <>
                            <ListChecks className="h-3.5 w-3.5" /> Virar tarefa
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "converge" && (
          <DialogFooter>
            <Button onClick={finish}>
              <Check className="h-4 w-4" /> Concluir
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
