import { useEffect, useMemo, useState } from "react";
import {
  Check, ChevronDown, ChevronUp, Loader2, Plus, RotateCcw, Trash2, User, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { EMPTY_VALUE, formatDate, toLocalISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STAGE_NAMES,
  RIDER_CATEGORIES,
  RIDER_PROVIDERS,
  STAGE_FIELD_DEFS,
  VIABILITY_COST_CATEGORIES,
  type ChecklistItem,
  type PartyBudgetItem,
  type PartyStage,
  type PartyTask,
  type PartyTicket,
  type RiderItem,
  type RiderTemplate,
  type StageStatus,
  type ViabilityCost,
} from "../types";
import { MarketingStagePanel } from "./MarketingStagePanel";
import { ViabilidadeStagePanel } from "./ViabilidadeStagePanel";
import { ExecucaoStagePanel } from "./ExecucaoStagePanel";
import { IdeacaoStagePanel } from "./IdeacaoStagePanel";
import { ConcretizacaoStagePanel } from "./ConcretizacaoStagePanel";
import type { Venue } from "@/modules/venues/types";
import type {
  PartyTeamMember,
  PartySponsor,
  PartyGuest,
  LineupStatus,
} from "../types";

const fmtCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Radix Select não aceita "" como value — sentinela p/ "sem responsável".
const NO_RESPONSAVEL = "_none";
import {
  createPartyStage,
  createPartyTask,
  createRiderTemplate,
  deletePartyStage,
  deleteRiderTemplate,
  listRiderTemplates,
  updatePartyStage,
} from "../api";
import { listSuppliers } from "@/modules/suppliers/api";
import type { Supplier } from "@/modules/suppliers/types";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";

/** Ponto de status do stepper — verde concluída, âmbar em andamento, cinza pendente. */
function stageStatusDot(s: StageStatus) {
  return s === "concluida" ? "bg-emerald-500" : s === "em_andamento" ? "bg-amber-500" : "bg-muted-foreground/40";
}

function stageStatusLabel(s: StageStatus) {
  return s === "concluida" ? "Concluída" : s === "em_andamento" ? "Em andamento" : "Pendente";
}

/**
 * Campos livres de uma etapa custom (§2.3). Etapas sem template (STAGE_FIELD_DEFS)
 * não têm mais um bloco "Notas" fixo: o dono monta os campos que fizerem sentido
 * (nome + valor), renomeia e preenche. Guardados como um array JSON numa chave
 * reservada de `stage.fields` — não colide com as chaves tipadas das etapas padrão
 * e viaja no backup como qualquer outro campo. */
const CUSTOM_FIELDS_KEY = "_campos";
type CustomField = { label: string; value: string };
function parseCustomFields(raw: unknown): CustomField[] {
  if (typeof raw !== "string") return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) {
      return p
        .filter((x) => x && typeof x === "object")
        .map((x) => ({ label: String(x.label ?? ""), value: String(x.value ?? "") }));
    }
  } catch {
    /* legado/inválido → sem campos */
  }
  return [];
}

export function WorkflowTab({
  partyId,
  stages,
  tasks,
  budgetItems,
  tickets,
  venues,
  confirmedVenueId,
  confirmedVenueName,
  expectedCapacity,
  partyTitle,
  partyDate,
  team,
  sponsors,
  lineup,
  lineupStatus,
  guests,
  barRevenue,
  actualAttendance,
  onPatchParty,
  onPatchTeam,
  onPatchSponsors,
  onPatchLineupStatus,
  onGoOrcamento,
  onOpenEquipe,
  onOpenVenue,
  onReload,
}: {
  partyId: number;
  stages: PartyStage[];
  tasks: PartyTask[];
  /** Itens do orçamento — Marketing lê a categoria "Marketing"; Viabilidade soma os custos (fonte única). */
  budgetItems: PartyBudgetItem[];
  /** Ingressos — para o CAC e o "vendido vs meta" da Mensuração. */
  tickets: PartyTicket[];
  /** Cadastro de venues — a Viabilidade compara casas candidatas. */
  venues: Venue[];
  /** Venue confirmado (parties.venue_id) — a escolha da casa vive na Viabilidade. */
  confirmedVenueId: number | null;
  confirmedVenueName: string | null;
  /** Público estimado canônico (Info) — usado no break-even, no lugar do antigo
   * campo "capacidade" da etapa de Viabilidade, removido na de-dup (slice 3b). */
  expectedCapacity: number | null;
  /** Título/data da festa — export do rider + prazo default das confirmações. */
  partyTitle: string;
  partyDate: string | null;
  /** Equipe (fonte única) — a Execução mostra confirmações destes registros. */
  team: PartyTeamMember[];
  sponsors: PartySponsor[];
  lineup: number[];
  lineupStatus: LineupStatus;
  /** Cortesias + receita de bar + presença real — base do RESULTADO da Concretização. */
  guests: PartyGuest[];
  barRevenue: number | null;
  actualAttendance: number | null;
  /** Atualiza campos da festa (venue/capacidade/público real) no buffer do form + persiste. */
  onPatchParty: (updates: { venue_id?: number | null; venue_name?: string | null; expected_capacity?: number | null; actual_attendance?: number | null }) => Promise<void>;
  /** Persiste confirmação na Equipe (fonte única) via mapper sobre o valor mais
   * fresco — evita que dois toggles rápidos se sobrescrevam. */
  onPatchTeam: (mapper: (prev: PartyTeamMember[]) => PartyTeamMember[]) => void;
  onPatchSponsors: (mapper: (prev: PartySponsor[]) => PartySponsor[]) => void;
  onPatchLineupStatus: (mapper: (prev: LineupStatus) => LineupStatus) => void;
  /** Leva o usuário para a aba Orçamento (link "editar no Orçamento"). */
  onGoOrcamento: () => void;
  /** Leva o usuário para a aba Equipe (add pessoa/fornecedor na fonte única). */
  onOpenEquipe: () => void;
  /** Abre o cadastro de um venue (guarda alteração não salva antes de navegar). */
  onOpenVenue: (venueId: number) => void;
  onReload: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string | number | null>>({});
  const [editNotes, setEditNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [inlineTask, setInlineTask] = useState<
    Record<number, { title: string; due_date: string; responsavel_contact_id: number | null }>
  >({});
  const [addingTask, setAddingTask] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => { void listSuppliers().then(setSuppliers); }, []);
  useEffect(() => { void listContacts().then(setContacts); }, []);
  const contactName = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of contacts) m.set(c.id, c.name);
    return m;
  }, [contacts]);

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
    const ok = await confirmDialog({
      title: "Excluir etapa",
      description: "As tarefas desta etapa ficam sem etapa (não são apagadas).",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
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
        responsavel_contact_id: t.responsavel_contact_id ?? null,
      });
      setInlineTask((prev) => ({
        ...prev,
        [stageId]: { title: "", due_date: "", responsavel_contact_id: null },
      }));
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
      {/* Stepper de LINHA ÚNICA — as etapas nunca quebram pra 2ª linha; clicar
          numa expande abaixo. Em telas apertadas o nome trunca (com tooltip). */}
      <div className="flex items-stretch gap-1 overflow-hidden rounded-lg border bg-card p-1">
        {stages.map((stage) => {
          // Gatilho do debrief: festa já passou e a Concretização segue pendente
          // → destaca a etapa (o destaque É o aviso; sem texto de nag).
          const needsDebrief =
            stage.name === "Concretização" &&
            !!partyDate && partyDate.slice(0, 10) < toLocalISODate() &&
            stage.status !== "concluida";
          return (
          <button
            key={stage.id}
            type="button"
            onClick={() =>
              expandedId === stage.id ? setExpandedId(null) : openStage(stage)
            }
            title={`${stage.name} · ${stageStatusLabel(stage.status)}${needsDebrief ? " · debrief pendente" : ""}`}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition",
              expandedId === stage.id ? "bg-primary/10 ring-1 ring-primary"
                : needsDebrief ? "bg-amber-500/10 ring-1 ring-amber-500/60 animate-pulse"
                : "hover:bg-muted/50"
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", stageStatusDot(stage.status))} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{stage.name}</span>
            {expandedId === stage.id ? (
              <ChevronUp className="h-3 w-3 shrink-0 opacity-60" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
            )}
          </button>
          );
        })}
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

            {stage.name === "Ideação" ? (
              <IdeacaoStagePanel partyId={partyId} stage={stage} onReload={onReload} />
            ) : stage.name === "Concretização" ? (
              <ConcretizacaoStagePanel
                partyId={partyId}
                stage={stage}
                stages={stages}
                budgetItems={budgetItems}
                tickets={tickets}
                sponsors={sponsors}
                guests={guests}
                barRevenue={barRevenue}
                actualAttendance={actualAttendance}
                expectedCapacity={expectedCapacity}
                onPatchParty={onPatchParty}
                onReload={onReload}
              />
            ) : stage.name === "Marketing" ? (
              <MarketingStagePanel
                partyId={partyId}
                stage={stage}
                partyTitle={partyTitle}
                budgetItems={budgetItems}
                tickets={tickets}
                expectedCapacity={expectedCapacity}
                onReload={onReload}
              />
            ) : stage.name === "Viabilidade" ? (
              <ViabilidadeStagePanel
                partyId={partyId}
                stage={stage}
                budgetItems={budgetItems}
                venues={venues}
                confirmedVenueId={confirmedVenueId}
                confirmedVenueName={confirmedVenueName}
                expectedCapacity={expectedCapacity}
                onPatchParty={onPatchParty}
                onOpenVenue={onOpenVenue}
                onGoOrcamento={onGoOrcamento}
                onReload={onReload}
              />
            ) : stage.name === "Execução" ? (
              <ExecucaoStagePanel
                partyId={partyId}
                stage={stage}
                partyTitle={partyTitle}
                partyDate={partyDate}
                team={team}
                sponsors={sponsors}
                lineup={lineup}
                lineupStatus={lineupStatus}
                contacts={contacts}
                suppliers={suppliers}
                onPatchTeam={onPatchTeam}
                onPatchSponsors={onPatchSponsors}
                onPatchLineupStatus={onPatchLineupStatus}
                onOpenEquipe={onOpenEquipe}
                onReload={onReload}
              />
            ) : (
            <>
            {fieldDefs.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldDefs.map((fd) => {
                  if (fd.key === "fornecedores_fechados") {
                    const raw = String(editFields[fd.key] ?? "");
                    let selectedIds: number[] = [];
                    try { const p = JSON.parse(raw); if (Array.isArray(p)) selectedIds = p; } catch { /* texto legado */ }
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
                  if (fd.type === "costs") {
                    return (
                      <div key={fd.key} className="sm:col-span-2">
                        <CostsField
                          label={fd.label}
                          value={String(editFields[fd.key] ?? "")}
                          publicoEstimado={expectedCapacity ?? (Number(editFields["capacidade"]) || 0)}
                          onChange={(v) =>
                            setEditFields((f) => ({ ...f, [fd.key]: v }))
                          }
                        />
                      </div>
                    );
                  }
                  if (fd.type === "checklist") {
                    return (
                      <div key={fd.key} className="sm:col-span-2">
                        <ChecklistField
                          label={fd.label}
                          value={String(editFields[fd.key] ?? "")}
                          onChange={(v) =>
                            setEditFields((f) => ({ ...f, [fd.key]: v }))
                          }
                        />
                      </div>
                    );
                  }
                  if (fd.type === "rider") {
                    return (
                      <div key={fd.key} className="sm:col-span-2">
                        <RiderField
                          label={fd.label}
                          value={String(editFields[fd.key] ?? "")}
                          onChange={(v) =>
                            setEditFields((f) => ({ ...f, [fd.key]: v }))
                          }
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={fd.key} className="space-y-1">
                      <Label className="text-xs">{fd.label}</Label>
                      {fd.type === "text" ? (
                        <AutoGrowTextarea
                          rows={2}
                          value={String(editFields[fd.key] ?? "")}
                          onChange={(v) =>
                            setEditFields((f) => ({ ...f, [fd.key]: v || null }))
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

            {/* §2.3 — etapa custom (sem template) monta os próprios campos:
                criar / renomear / preencher. Sem bloco "Notas" fixo: o dono
                escolhe o que faz sentido (pode criar um campo "Notas" se quiser). */}
            {fieldDefs.length === 0 && (() => {
              const customFields = parseCustomFields(editFields[CUSTOM_FIELDS_KEY]);
              const setCustom = (next: CustomField[]) =>
                setEditFields((f) => ({
                  ...f,
                  [CUSTOM_FIELDS_KEY]: next.length ? JSON.stringify(next) : null,
                }));
              return (
                <div className="space-y-2">
                  <Label className="text-xs">Campos</Label>
                  {customFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Monte esta etapa do seu jeito — adicione os campos que fizerem sentido.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {customFields.map((cf, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Input
                            className="h-8 w-1/3 min-w-[7rem] text-xs"
                            placeholder="Nome do campo"
                            value={cf.label}
                            onChange={(e) => {
                              const next = customFields.slice();
                              next[i] = { ...next[i], label: e.target.value };
                              setCustom(next);
                            }}
                          />
                          <AutoGrowTextarea
                            className="flex-1"
                            placeholder="Valor…"
                            value={cf.value}
                            onChange={(v) => {
                              const next = customFields.slice();
                              next[i] = { ...next[i], value: v };
                              setCustom(next);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => setCustom(customFields.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCustom([...customFields, { label: "", value: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar campo
                  </Button>
                </div>
              );
            })()}

            {/* Notas: bloco fixo só nas etapas padrão; nas custom aparece apenas
                se já houver nota gravada (legado) — a nova nasce sem ele. */}
            {(fieldDefs.length > 0 || (stage.notes ?? "").trim() !== "") && (
              <div className="space-y-1">
                <Label className="text-xs">Notas</Label>
                <AutoGrowTextarea
                  rows={3}
                  value={editNotes}
                  onChange={(v) => setEditNotes(v)}
                  placeholder="Observações sobre esta etapa…"
                />
              </div>
            )}
            </>
            )}

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
                      {task.responsavel_contact_id != null && contactName.has(task.responsavel_contact_id) && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {contactName.get(task.responsavel_contact_id)}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(task.due_date)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[10rem] flex-1 h-8 text-xs"
                  placeholder="Nova tarefa…"
                  value={inlineTask[stage.id]?.title ?? ""}
                  onChange={(e) =>
                    setInlineTask((p) => ({
                      ...p,
                      [stage.id]: {
                        title: e.target.value,
                        due_date: p[stage.id]?.due_date ?? "",
                        responsavel_contact_id: p[stage.id]?.responsavel_contact_id ?? null,
                      },
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddTaskToStage(stage.id);
                  }}
                />
                <Select
                  value={
                    inlineTask[stage.id]?.responsavel_contact_id != null
                      ? String(inlineTask[stage.id]?.responsavel_contact_id)
                      : NO_RESPONSAVEL
                  }
                  onValueChange={(v) =>
                    setInlineTask((p) => ({
                      ...p,
                      [stage.id]: {
                        title: p[stage.id]?.title ?? "",
                        due_date: p[stage.id]?.due_date ?? "",
                        responsavel_contact_id: v === NO_RESPONSAVEL ? null : Number(v),
                      },
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_RESPONSAVEL}>Sem responsável</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  className="w-36 h-8 text-xs"
                  value={inlineTask[stage.id]?.due_date ?? ""}
                  onChange={(e) =>
                    setInlineTask((p) => ({
                      ...p,
                      [stage.id]: {
                        title: p[stage.id]?.title ?? "",
                        due_date: e.target.value,
                        responsavel_contact_id: p[stage.id]?.responsavel_contact_id ?? null,
                      },
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

            {/* Marketing e Viabilidade salvam sozinhos (o painel persiste cada
                mudança); as demais etapas usam este Salvar pra gravar campos +
                notas de uma vez. */}
            {stage.name !== "Ideação" && stage.name !== "Marketing" && stage.name !== "Viabilidade" && stage.name !== "Execução" && stage.name !== "Concretização" && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => void saveStage(stage)} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar
                </Button>
              </div>
            )}
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

/** Sistema de linhas de custos estimados + cálculo de break-even por pessoa. */
function CostsField({
  label,
  value,
  publicoEstimado,
  onChange,
}: {
  label: string;
  value: string;
  publicoEstimado: number;
  onChange: (v: string | null) => void;
}) {
  let rows: ViabilityCost[] = [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) rows = parsed;
  } catch { /* vazio ou legado */ }

  const [cat, setCat] = useState<string>(VIABILITY_COST_CATEGORIES[0]);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const ticketMedio = publicoEstimado > 0 ? total / publicoEstimado : null;

  function save(next: ViabilityCost[]) {
    onChange(next.length ? JSON.stringify(next) : null);
  }

  function addRow() {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      toast.error("Informe um valor válido para o custo");
      return;
    }
    save([...rows, { category: cat, description: desc.trim(), amount: val }]);
    setDesc("");
    setAmount("");
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>

      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.category}</span>
              <span className="flex-1 truncate text-muted-foreground">
                {r.description || EMPTY_VALUE}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {fmtCurrency(r.amount)}
              </span>
              <button
                type="button"
                onClick={() => save(rows.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover custo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_8rem_auto]">
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {VIABILITY_COST_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-xs"
          placeholder="Descrição"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addRow(); }}
        />
        <Input
          className="h-8 text-xs"
          type="number"
          min={0}
          step={0.01}
          placeholder="Valor (R$)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addRow(); }}
        />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Total de custos</span>
        <span className="font-semibold tabular-nums">{fmtCurrency(total)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Ticket médio p/ break-even
          {publicoEstimado > 0 ? ` (${publicoEstimado} pessoas)` : ""}
        </span>
        <span className="font-semibold tabular-nums">
          {ticketMedio !== null ? fmtCurrency(ticketMedio) : "informe o público estimado"}
        </span>
      </div>
    </div>
  );
}

/** Checklist operacional: itens marcáveis com adição/remoção de linhas. */
export function ChecklistField({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (v: string | null) => void;
  /** Chips de sugestão de itens comuns (um toque cria). */
  suggestions?: string[];
}) {
  let items: ChecklistItem[] = [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    // Migra texto legado: cada linha vira um item não-concluído.
    if (value.trim()) {
      items = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .map((text) => ({ text, done: false }));
    }
  }

  const [newItem, setNewItem] = useState("");

  function save(next: ChecklistItem[]) {
    onChange(next.length ? JSON.stringify(next) : null);
  }

  function addItem() {
    const text = newItem.trim();
    if (!text) return;
    save([...items, { text, done: false }]);
    setNewItem("");
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  save(items.map((it, j) => (j === i ? { ...it, done: !it.done } : it)))
                }
                className="h-4 w-4 shrink-0"
              />
              <span className={cn("flex-1", item.done && "line-through text-muted-foreground")}>
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => save(items.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {suggestions && suggestions.filter((s) => !items.some((it) => it.text.trim().toLowerCase() === s.toLowerCase())).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !items.some((it) => it.text.trim().toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => save([...items, { text: s, done: false }])}
                className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> {s}
              </button>
            ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          className="h-8 flex-1 text-xs"
          placeholder="Novo item do checklist…"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
        />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Rider técnico estruturado + reutilizável: equipamentos (categoria, item, qtd,
 *  quem fornece) marcáveis, salváveis como modelo e recarregáveis entre festas. */
export function RiderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string | null) => void;
}) {
  let items: RiderItem[] = [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    // Rider em texto legado: cada linha vira um item "Outros" não-conferido.
    if (value.trim()) {
      items = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .map((t) => ({ category: "Outros", item: t, quantity: 1, by: "Casa", done: false }));
    }
  }

  const [cat, setCat] = useState<string>(RIDER_CATEGORIES[0]);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [by, setBy] = useState<string>(RIDER_PROVIDERS[0]);
  const [templates, setTemplates] = useState<RiderTemplate[]>([]);

  const reloadTemplates = () => { void listRiderTemplates().then(setTemplates); };
  useEffect(() => { reloadTemplates(); }, []);

  function save(next: RiderItem[]) {
    onChange(next.length ? JSON.stringify(next) : null);
  }

  function addRow() {
    const t = item.trim();
    if (!t) { toast.error("Informe o item do rider"); return; }
    save([...items, { category: cat, item: t, quantity: Math.max(1, parseInt(qty, 10) || 1), by, done: false }]);
    setItem("");
    setQty("1");
  }

  async function saveAsTemplate() {
    if (items.length === 0) { toast.error("Rider vazio: nada pra salvar como modelo."); return; }
    const name = window.prompt("Nome do modelo de rider:");
    if (!name || !name.trim()) return;
    try {
      await createRiderTemplate(name.trim(), JSON.stringify(items));
      reloadTemplates();
      toast.success("Modelo de rider salvo.");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  function loadTemplate(id: string) {
    if (id === "_none") return;
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    let loaded: RiderItem[] = [];
    try { const p = JSON.parse(t.items); if (Array.isArray(p)) loaded = p; } catch { /* modelo corrompido */ }
    save([...items, ...loaded]); // anexa ao rider atual, sem apagar o existente
    toast.success(`Modelo "${t.name}" carregado.`);
  }

  async function removeTemplate(id: number) {
    try { await deleteRiderTemplate(id); reloadTemplates(); }
    catch (e) { toast.error(`Erro: ${String(e)}`); }
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1.5">
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{doneCount}/{items.length} ok</span>
          )}
          {templates.length > 0 && (
            <Select value="_none" onValueChange={loadTemplate}>
              <SelectTrigger className="h-7 w-auto gap-1 text-xs"><SelectValue placeholder="Carregar modelo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none" disabled>Carregar modelo…</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void saveAsTemplate()}>
            Salvar modelo
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={r.done}
                onChange={() => save(items.map((it, j) => (j === i ? { ...it, done: !it.done } : it)))}
                className="h-4 w-4 shrink-0"
                title="Conferido"
              />
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">{r.category}</span>
              <span className={cn("flex-1 truncate", r.done && "line-through text-muted-foreground")}>
                {r.quantity > 1 ? `${r.quantity}× ` : ""}{r.item}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{r.by}</span>
              <button
                type="button"
                onClick={() => save(items.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_4.5rem_7rem_auto]">
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RIDER_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-xs"
          placeholder="Equipamento (ex.: CDJ-3000)"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addRow(); }}
        />
        <Input className="h-8 text-xs" type="number" min={1} placeholder="Qtd" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Select value={by} onValueChange={setBy}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RIDER_PROVIDERS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {templates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {templates.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              {t.name}
              <button type="button" onClick={() => void removeTemplate(t.id)} className="hover:text-destructive" aria-label="Excluir modelo">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
