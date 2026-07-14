import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks, Moon, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  getJournal,
  getPriorities,
  listOpenTasksToday,
  saveJournal,
  setPriorities,
  todayISO,
  tomorrowISO,
  type OpenTask,
  type PriorityInput,
} from "./api";

const SLOTS = 3;

type Slot = { title: string; task_id: number | null };

/**
 * Ritual de encerramento do dia (~90s): revê o que ficou aberto, escolhe o
 * Top 3 de amanhã e escreve 1 linha de diário. Base: Masicampo & Baumeister
 * (2011) — planejar a pendência já silencia a ruminação; Gollwitzer — intenção
 * concreta (o Top 3) rende mais.
 */
export function ShutdownDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([]);
  const [slots, setSlots] = useState<Slot[]>(
    Array.from({ length: SLOTS }, () => ({ title: "", task_id: null }))
  );
  const [diary, setDiary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [tasks, existing, journal] = await Promise.all([
        listOpenTasksToday(),
        getPriorities("day", tomorrowISO()),
        getJournal("day", todayISO()),
      ]);
      setOpenTasks(tasks);
      setDiary(journal);
      // Pré-preenche os slots com o Top 3 de amanhã que já exista.
      const next: Slot[] = Array.from({ length: SLOTS }, () => ({ title: "", task_id: null }));
      existing.slice(0, SLOTS).forEach((p, i) => {
        next[i] = { title: p.title, task_id: p.task_id };
      });
      setSlots(next);
    })();
  }, [open]);

  function setSlot(i: number, patch: Partial<Slot>) {
    setSlots((s) => s.map((sl, idx) => (idx === i ? { ...sl, ...patch } : sl)));
  }

  /** Joga a tarefa aberta no primeiro slot vazio do Top 3 (ou avisa se cheio). */
  function addTaskToTop3(t: OpenTask) {
    const idx = slots.findIndex((s) => !s.title.trim() && s.task_id == null);
    if (idx === -1) {
      toast.error("O Top 3 já está cheio — troque um item primeiro.");
      return;
    }
    setSlot(idx, { title: t.title, task_id: t.id });
  }

  const usedTaskIds = new Set(slots.map((s) => s.task_id).filter((x): x is number => x != null));

  async function handleSave() {
    setSaving(true);
    try {
      const items: PriorityInput[] = slots
        .map((s) => ({ title: s.title.trim(), task_id: s.task_id }))
        .filter((s) => s.title || s.task_id != null);
      await setPriorities("day", tomorrowISO(), items);
      await saveJournal("day", todayISO(), diary.trim());
      toast.success("Dia fechado. Amanhã começa com seu Top 3.");
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao fechar o dia: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" /> Fechar o dia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1) O que ficou aberto */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecks className="h-4 w-4 text-muted-foreground" /> O que ficou aberto
            </div>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada vencido ou de hoje em aberto. Dia limpo. 🎉
              </p>
            ) : (
              <ul className="space-y-1">
                {openTasks.map((t) => {
                  const already = usedTaskIds.has(t.id);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border bg-card/40 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.due_date && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(t.due_date)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        disabled={already}
                        onClick={() => addTaskToTop3(t)}
                      >
                        {already ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4" /> Top 3
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 2) Top 3 de amanhã */}
          <section className="space-y-2">
            <Label className="text-sm font-medium">Top 3 de amanhã</Label>
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      s.title || s.task_id != null
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <Input
                    value={s.title}
                    placeholder={
                      s.task_id != null ? "" : "Escreva ou puxe uma tarefa acima…"
                    }
                    onChange={(e) => setSlot(i, { title: e.target.value })}
                  />
                  {s.task_id != null && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      title="Desvincular a tarefa (vira texto livre)"
                      onClick={() => setSlot(i, { task_id: null })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 3) Diário */}
          <section className="space-y-1.5">
            <Label className="text-sm font-medium">Diário de hoje (1 linha)</Label>
            <Input
              value={diary}
              placeholder="Como foi o dia? Uma linha basta."
              onChange={(e) => setDiary(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Moon className="h-4 w-4" /> Fechar o dia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
