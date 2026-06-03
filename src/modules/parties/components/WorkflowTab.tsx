import { useEffect, useState } from "react";
import {
  Check, ChevronDown, ChevronUp, Loader2, Plus, RotateCcw, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STAGE_NAMES,
  STAGE_FIELD_DEFS,
  type PartyStage,
  type PartyTask,
  type StageStatus,
} from "../types";
import {
  createPartyStage,
  createPartyTask,
  deletePartyStage,
  updatePartyStage,
} from "../api";
import { listSuppliers } from "@/modules/suppliers/api";
import type { Supplier } from "@/modules/suppliers/types";

function stageStatusColor(s: StageStatus) {
  return s === "concluida"
    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : s === "em_andamento"
    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
    : "bg-muted/40 text-muted-foreground border-border";
}

function stageStatusLabel(s: StageStatus) {
  return s === "concluida" ? "Concluída" : s === "em_andamento" ? "Em andamento" : "Pendente";
}

export function WorkflowTab({
  partyId,
  stages,
  tasks,
  onReload,
}: {
  partyId: number;
  stages: PartyStage[];
  tasks: PartyTask[];
  onReload: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string | number | null>>({});
  const [editNotes, setEditNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [inlineTask, setInlineTask] = useState<Record<number, { title: string; due_date: string }>>({});
  const [addingTask, setAddingTask] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => { void listSuppliers().then(setSuppliers); }, []);

  function openStage(stage: PartyStage) {
    setExpandedId(stage.id);
    setEditFields({ ...stage.fields });
    setEditNotes(stage.notes ?? "");
  }

  async function saveStage(stage: PartyStage) {
    setSaving(true);
    try {
      await updatePartyStage(stage.id, { fields: editFields, notes: editNotes || null });
      await onReload();
      toast.success("Etapa salva");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(stage: PartyStage) {
    const next: StageStatus =
      stage.status === "pendente"
        ? "em_andamento"
        : stage.status === "em_andamento"
        ? "concluida"
        : "pendente";
    try {
      await updatePartyStage(stage.id, {
        status: next,
        completed_at: next === "concluida" ? new Date().toISOString() : null,
      });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleAddStage() {
    const name = newStageName.trim();
    if (!name) return;
    setAddingStage(true);
    try {
      const pos = stages.length;
      await createPartyStage(partyId, name, pos);
      setNewStageName("");
      await onReload();
      toast.success("Etapa adicionada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAddingStage(false);
    }
  }

  async function handleDeleteStage(id: number) {
    try {
      await deletePartyStage(id);
      if (expandedId === id) setExpandedId(null);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleAddTaskToStage(stageId: number) {
    const t = inlineTask[stageId];
    const title = t?.title?.trim();
    if (!title) return;
    setAddingTask(stageId);
    try {
      await createPartyTask({
        party_id: partyId,
        stage_id: stageId,
        title,
        status: "pendente",
        priority: "Normal",
        due_date: t.due_date || null,
        notes: null,
      });
      setInlineTask((prev) => ({ ...prev, [stageId]: { title: "", due_date: "" } }));
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAddingTask(null);
    }
  }

  async function handleRestoreDefaults() {
    setRestoringDefaults(true);
    try {
      for (const s of stages) {
        await deletePartyStage(s.id);
      }
      for (let i = 0; i < DEFAULT_STAGE_NAMES.length; i++) {
        await createPartyStage(partyId, DEFAULT_STAGE_NAMES[i], i);
      }
      setExpandedId(null);
      await onReload();
      toast.success("Etapas restauradas");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setRestoringDefaults(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={cn(
              "min-w-[140px] flex-1 rounded-lg border p-3 cursor-pointer transition",
              stageStatusColor(stage.status),
              expandedId === stage.id && "ring-2 ring-primary"
            )}
            onClick={() =>
              expandedId === stage.id ? setExpandedId(null) : openStage(stage)
            }
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium truncate">{stage.name}</span>
              {expandedId === stage.id ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
            </div>
            <div className="mt-1 text-xs opacity-80">{stageStatusLabel(stage.status)}</div>
          </div>
        ))}
      </div>

      {expandedId !== null && (() => {
        const stage = stages.find((s) => s.id === expandedId);
        if (!stage) return null;
        const fieldDefs = STAGE_FIELD_DEFS[stage.name] ?? [];
        return (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{stage.name}</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleStatus(stage)}
                >
                  {stage.status === "concluida" ? (
                    <><RotateCcw className="h-3.5 w-3.5" /> Reabrir</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" /> {stage.status === "pendente" ? "Iniciar" : "Concluir"}</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDeleteStage(stage.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {fieldDefs.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldDefs.map((fd) => {
                  if (fd.key === "fornecedores_fechados") {
                    const raw = String(editFields[fd.key] ?? "");
                    let selectedIds: number[] = [];
                    try { selectedIds = JSON.parse(raw); } catch { /* texto legado */ }
                    const selectedSuppliers = suppliers.filter((s) => selectedIds.includes(s.id));
                    const unselected = suppliers.filter((s) => !selectedIds.includes(s.id));
                    return (
                      <div key={fd.key} className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">{fd.label}</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedSuppliers.map((s) => (
                            <span
                              key={s.id}
                              className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs"
                            >
                              {s.name}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = selectedIds.filter((id) => id !== s.id);
                                  setEditFields((f) => ({
                                    ...f,
                                    [fd.key]: next.length ? JSON.stringify(next) : null,
                                  }));
                                }}
                                className="ml-0.5 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          {unselected.length > 0 && (
                            <Select
                              value="_add"
                              onValueChange={(v) => {
                                if (v === "_add") return;
                                const next = [...selectedIds, Number(v)];
                                setEditFields((f) => ({
                                  ...f,
                                  [fd.key]: JSON.stringify(next),
                                }));
                              }}
                            >
                              <SelectTrigger className="h-7 w-auto gap-1 rounded-full border bg-muted px-2.5 text-xs">
                                <Plus className="h-3 w-3" />
                                <span>Adicionar fornecedor</span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_add" disabled>Selecionar…</SelectItem>
                                {unselected.map((s) => (
                                  <SelectItem key={s.id} value={String(s.id)}>
                                    {s.name}{s.category ? ` · ${s.category}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={fd.key} className="space-y-1">
                      <Label className="text-xs">{fd.label}</Label>
                      {fd.type === "text" ? (
                        <Textarea
                          rows={2}
                          value={String(editFields[fd.key] ?? "")}
                          onChange={(e) =>
                            setEditFields((f) => ({ ...f, [fd.key]: e.target.value || null }))
                          }
                        />
                      ) : (
                        <Input
                          type={fd.type}
                          value={String(editFields[fd.key] ?? "")}
                          onChange={(e) =>
                            setEditFields((f) => ({
                              ...f,
                              [fd.key]:
                                fd.type === "number"
                                  ? e.target.value ? Number(e.target.value) : null
                                  : e.target.value || null,
                            }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Observações sobre esta etapa…"
              />
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tarefas desta etapa
              </div>
              {tasks.filter((t) => t.stage_id === stage.id).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma tarefa ainda.</p>
              ) : (
                <div className="space-y-1">
                  {tasks.filter((t) => t.stage_id === stage.id).map((task) => (
                    <div key={task.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                      <span className={cn(
                        "flex-1",
                        task.status === "concluida" ? "line-through text-muted-foreground" : ""
                      )}>
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.due_date)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1 h-8 text-xs"
                  placeholder="Nova tarefa…"
                  value={inlineTask[stage.id]?.title ?? ""}
                  onChange={(e) =>
                    setInlineTask((p) => ({
                      ...p,
                      [stage.id]: { ...p[stage.id], title: e.target.value, due_date: p[stage.id]?.due_date ?? "" },
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddTaskToStage(stage.id);
                  }}
                />
                <Input
                  type="date"
                  className="w-36 h-8 text-xs"
                  value={inlineTask[stage.id]?.due_date ?? ""}
                  onChange={(e) =>
                    setInlineTask((p) => ({
                      ...p,
                      [stage.id]: { ...p[stage.id], due_date: e.target.value, title: p[stage.id]?.title ?? "" },
                    }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={addingTask === stage.id}
                  onClick={() => void handleAddTaskToStage(stage.id)}
                >
                  {addingTask === stage.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => void saveStage(stage)} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Input
          placeholder="Nome da nova etapa"
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          className="w-48"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAddStage();
          }}
        />
        <Button size="sm" variant="outline" onClick={() => void handleAddStage()} disabled={addingStage}>
          <Plus className="h-3.5 w-3.5" /> Adicionar etapa
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleRestoreDefaults()}
          disabled={restoringDefaults}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar etapas padrão
        </Button>
      </div>
    </div>
  );
}
