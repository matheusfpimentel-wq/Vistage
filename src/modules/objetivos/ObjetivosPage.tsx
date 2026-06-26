import { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Link2, Link2Off, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { listOkrs, deleteOkr, okrProgress, listKrTasks, linkTaskToKr, unlinkTaskFromKr, type Okr, type KeyResult, type OkrLinkedTask } from "./api";
import { listTasks } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { OkrForm } from "./forms/OkrForm";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";

export function ObjetivosPage() {
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Okr | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  async function refresh() {
    const [okrList, tasks] = await Promise.all([
      listOkrs(),
      listTasks({ status: "A fazer" }).then((a) =>
        listTasks({ status: "Em andamento" }).then((b) => [...a, ...b])
      ),
    ]);
    setOkrs(okrList);
    setAllTasks(tasks);
  }

  useEffect(() => { void refresh(); }, []);

  const byQuarter = okrs.reduce<Record<string, Okr[]>>((acc, o) => {
    (acc[o.quarter] ??= []).push(o);
    return acc;
  }, {});

  const quarters = Object.keys(byQuarter).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <ModuleToolbar
        primaryAction={{ label: "Novo OKR", icon: Plus, onClick: () => { setEditing(null); setFormOpen(true); } }}
        resultCount={okrs.length}
        resultLabel="OKRs"
      >
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Em dia (≥70%)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />Em risco (40–69%)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-primary/60" />Atrasado (&lt;40%)</span>
        </div>
      </ModuleToolbar>

      {quarters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-12 text-center">
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo OKR
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {quarters.map((q) => (
            <div key={q}>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">{q}</h3>
              <div className="space-y-4">
                {byQuarter[q].map((okr) => (
                  <OkrCard
                    key={okr.id}
                    okr={okr}
                    allTasks={allTasks}
                    onEdit={() => { setEditing(okr); setFormOpen(true); }}
                    onDelete={async () => {
                      if (!(await confirmDialog({ title: "Excluir", description: "Excluir este OKR?", confirmLabel: "Excluir", destructive: true }))) return;
                      await deleteOkr(okr.id);
                      toast.success("OKR excluído");
                      void refresh();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <OkrForm
        open={formOpen}
        onOpenChange={setFormOpen}
        okr={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function OkrCard({
  okr,
  allTasks,
  onEdit,
  onDelete,
}: {
  okr: Okr;
  allTasks: Task[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const progress = okrProgress(okr);
  const pct = Math.round(progress * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Target className={cn("mt-0.5 h-4 w-4 shrink-0", pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-muted-foreground")} />
          <div className="flex-1">
            <CardTitle className="text-base leading-snug">{okr.objective}</CardTitle>
            <CardDescription className="mt-1">
              {okr.key_results.length} key result{okr.key_results.length !== 1 ? "s" : ""} · {pct}% concluído
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <ProgressBar value={progress} />
      </CardHeader>

      {expanded && okr.key_results.length > 0 && (
        <CardContent className="space-y-3 pt-0">
          {okr.key_results.map((kr, i) => (
            <KrRow key={kr.id} kr={kr} index={i} okrId={okr.id} allTasks={allTasks} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function KrRow({ kr, index, okrId, allTasks }: { kr: KeyResult; index: number; okrId: number; allTasks: Task[] }) {
  const pct = kr.target > 0 ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
  const isAuto = kr.metric_source !== "manual";
  const [tasksOpen, setTasksOpen] = useState(false);
  const [linkedTasks, setLinkedTasks] = useState<OkrLinkedTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("none");

  async function refreshLinked() {
    const tasks = await listKrTasks(okrId, index);
    setLinkedTasks(tasks);
  }

  // Carrega os vínculos SEMPRE (não só ao abrir o painel) — senão o aviso
  // "Nenhuma tarefa vinculada" ficava aceso mesmo com tarefa já vinculada,
  // porque a lista só era buscada quando o painel abria.
  useEffect(() => {
    void refreshLinked();
  }, [okrId, index]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLink() {
    if (selectedTaskId === "none") return;
    await linkTaskToKr(okrId, index, Number(selectedTaskId));
    setSelectedTaskId("none");
    void refreshLinked();
    toast.success("Tarefa vinculada ao KR");
  }

  async function handleUnlink(taskId: number) {
    await unlinkTaskFromKr(okrId, index, taskId);
    void refreshLinked();
    toast.success("Tarefa desvinculada");
  }

  const linkedIds = new Set(linkedTasks.map((t) => t.task_id));
  const available = allTasks.filter((t) => !linkedIds.has(t.id));

  function taskStatusVariant(status: string): "default" | "secondary" | "outline" | "success" | "warning" {
    if (status === "Concluída") return "success";
    if (status === "Em andamento") return "warning";
    return "secondary";
  }

  return (
    <div className="space-y-1 rounded-md border p-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
          <span className="shrink-0 font-medium text-foreground">KR{index + 1}</span>
          <span className="truncate">{kr.description}</span>
          {isAuto && <span className="shrink-0 text-[10px] text-primary/70">(auto)</span>}
          {!tasksOpen && linkedTasks.length === 0 && (
            <span title="Nenhuma tarefa vinculada a este KR">
              <AlertCircle className="shrink-0 h-3.5 w-3.5 text-amber-500" />
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="tabular-nums text-xs">{kr.current} / {kr.target} {kr.unit}</span>
          <button
            type="button"
            onClick={() => setTasksOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Tarefas vinculadas a este KR"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ProgressBar value={pct / 100} size="sm" />

      {tasksOpen && (
        <div className="mt-1.5 space-y-1.5 border-t pt-1.5">
          {linkedTasks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nenhuma tarefa vinculada a este KR.</p>
          ) : (
            <div className="space-y-1">
              {linkedTasks.map((t) => (
                <div key={t.task_id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs">
                  <span className="flex-1 truncate">{t.title}</span>
                  <Badge variant={taskStatusVariant(t.status)} className="text-[10px] px-1.5">{t.status}</Badge>
                  <button
                    type="button"
                    onClick={() => void handleUnlink(t.task_id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Desvincular"
                  >
                    <Link2Off className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
              <SelectTrigger className="flex-1 h-7 text-xs">
                <SelectValue placeholder="Vincular tarefa…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Vincular tarefa…</SelectItem>
                {available.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs px-2" onClick={() => void handleLink()} disabled={selectedTaskId === "none"}>
              Vincular
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const pct = Math.round(Math.min(1, value) * 100);
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2")}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary/60"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
