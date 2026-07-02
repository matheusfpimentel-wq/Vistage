import { useEffect, useMemo, useState } from "react";
import { HelpCircle, Pencil, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { loadFanAutoRules, loadFanClubConfig, saveFanAutoRules } from "../api";
import { FAN_SUGGESTION_RULES } from "../suggestions";
import {
  FAN_INTERACTION_TYPES,
  FAN_LEVELS,
  FAN_PERK_CATEGORIES,
  type FanAutoRule,
  type FanClubPerkTemplate,
  type FanInteractionType,
  type FanLevel,
  type FanPerkCategory,
  type FanRuleAction,
  type FanRuleTrigger,
} from "../types";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Descrições legíveis (PT) do gatilho e da ação, para a lista de regras ──────

function describeTrigger(t: FanRuleTrigger): string {
  switch (t.type) {
    case "level_reached":
      return `Quando o fã atingir ${t.level} (ou acima)`;
    case "fan_for_days":
      return t.level
        ? `Quando estiver há ${t.days} dia(s) como ${t.level}`
        : `Quando for fã há ${t.days} dia(s)`;
    case "inactive_days":
      return t.level
        ? `Quando ${t.level} ficar ${t.days} dia(s) sem interação`
        : `Quando ficar ${t.days} dia(s) sem interação`;
  }
}

function describeAction(a: FanRuleAction): string {
  switch (a.type) {
    case "grant_perk":
      return `conceder perk "${a.perkName}" (${a.perkCategory})`;
    case "log_interaction":
      return `registrar interação de ${a.interactionType}${a.note?.trim() ? ` ("${a.note.trim()}")` : ""}`;
    case "create_task":
      return `criar tarefa "${a.taskTitle}"`;
  }
}

// ── Regra "em rascunho" (form), em strings, para o editor de nova/editar ──────

type TriggerType = FanRuleTrigger["type"];
type ActionType = FanRuleAction["type"];

type DraftRule = {
  id: string;
  enabled: boolean;
  name: string;
  triggerType: TriggerType;
  triggerLevel: FanLevel; // usado por level_reached e (opcional) pelos demais
  triggerLevelAny: boolean; // fan_for_days/inactive_days: aplicar a qualquer nível
  triggerDays: string;
  actionType: ActionType;
  perkCategory: FanPerkCategory;
  perkName: string;
  interactionType: FanInteractionType;
  interactionNote: string;
  taskTitle: string;
};

function emptyDraft(): DraftRule {
  return {
    id: uid(),
    enabled: true,
    name: "",
    triggerType: "level_reached",
    triggerLevel: "Superfã",
    triggerLevelAny: true,
    triggerDays: "30",
    actionType: "grant_perk",
    perkCategory: "Brinde",
    perkName: "",
    interactionType: "Interação",
    interactionNote: "",
    taskTitle: "",
  };
}

function ruleToDraft(r: FanAutoRule): DraftRule {
  const d = emptyDraft();
  d.id = r.id;
  d.enabled = r.enabled;
  d.name = r.name ?? "";
  d.triggerType = r.trigger.type;
  if (r.trigger.type === "level_reached") {
    d.triggerLevel = r.trigger.level;
  } else {
    d.triggerDays = String(r.trigger.days);
    if (r.trigger.level) {
      d.triggerLevel = r.trigger.level;
      d.triggerLevelAny = false;
    } else {
      d.triggerLevelAny = true;
    }
  }
  d.actionType = r.action.type;
  if (r.action.type === "grant_perk") {
    d.perkCategory = r.action.perkCategory;
    d.perkName = r.action.perkName;
  } else if (r.action.type === "log_interaction") {
    d.interactionType = r.action.interactionType;
    d.interactionNote = r.action.note ?? "";
  } else if (r.action.type === "create_task") {
    d.taskTitle = r.action.taskTitle;
  }
  return d;
}

/** Valida e converte o rascunho em FanAutoRule; retorna null se inválido. */
function draftToRule(d: DraftRule): FanAutoRule | null {
  let trigger: FanRuleTrigger;
  if (d.triggerType === "level_reached") {
    trigger = { type: "level_reached", level: d.triggerLevel };
  } else {
    const days = Number(d.triggerDays);
    if (!Number.isFinite(days) || days <= 0) return null;
    const lvl = d.triggerLevelAny ? undefined : d.triggerLevel;
    trigger =
      d.triggerType === "fan_for_days"
        ? { type: "fan_for_days", days, ...(lvl ? { level: lvl } : {}) }
        : { type: "inactive_days", days, ...(lvl ? { level: lvl } : {}) };
  }

  let action: FanRuleAction;
  if (d.actionType === "grant_perk") {
    if (!d.perkName.trim()) return null;
    action = { type: "grant_perk", perkCategory: d.perkCategory, perkName: d.perkName.trim() };
  } else if (d.actionType === "log_interaction") {
    action = {
      type: "log_interaction",
      interactionType: d.interactionType,
      ...(d.interactionNote.trim() ? { note: d.interactionNote.trim() } : {}),
    };
  } else {
    if (!d.taskTitle.trim()) return null;
    action = { type: "create_task", taskTitle: d.taskTitle.trim() };
  }

  return {
    id: d.id,
    enabled: d.enabled,
    ...(d.name.trim() ? { name: d.name.trim() } : {}),
    trigger,
    action,
  };
}

export function FanAutoRulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rules, setRules] = useState<FanAutoRule[]>([]);
  const [perks, setPerks] = useState<FanClubPerkTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // draft != null → editor aberto (nova regra ou edição de uma existente).
  const [draft, setDraft] = useState<DraftRule | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadFanAutoRules().then(setRules);
    void loadFanClubConfig().then((c) => setPerks(c.perks));
    setDraft(null);
    setShowHelp(false);
  }, [open]);

  function startNew() {
    setDraft(emptyDraft());
  }
  function startEdit(r: FanAutoRule) {
    setDraft(ruleToDraft(r));
  }

  function toggleEnabled(id: string, enabled: boolean) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
  }

  async function handleRemove(r: FanAutoRule) {
    const ok = await confirmDialog({
      title: "Excluir regra",
      description: `Excluir a ação programada "${r.name ?? describeTrigger(r.trigger)}"?`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setRules((rs) => rs.filter((x) => x.id !== r.id));
  }

  function commitDraft() {
    if (!draft) return;
    const rule = draftToRule(draft);
    if (!rule) {
      toast.error("Preencha os campos da regra (dias > 0 e nome do perk/tarefa).");
      return;
    }
    setRules((rs) => {
      const exists = rs.some((r) => r.id === rule.id);
      return exists ? rs.map((r) => (r.id === rule.id ? rule : r)) : [...rs, rule];
    });
    setDraft(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFanAutoRules(rules);
      toast.success("Ações programadas salvas");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Ações programadas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Componha regras "se… então…" que rodam automaticamente sobre seus fãs.
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              aria-label="Como funciona"
              onClick={() => setShowHelp((v) => !v)}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
          {showHelp && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              As regras rodam sozinhas (ao abrir o Clube de Fãs e quando os níveis são
              recalculados). Cada regra se aplica <strong>no máximo uma vez por fã</strong>:
              não duplica perks, interações nem tarefas se rodar de novo.
            </div>
          )}

          {/* Sugestões automáticas embutidas: a regra "se… então…" por trás de cada
              balde de Próximas ações, mostrada de forma explícita (read-only). */}
          {!draft && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Sugestões automáticas</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Regras embutidas que geram os cartões da aba <strong>Próximas ações</strong>. Sempre
                ativas — mostradas aqui pra você ver o critério de cada uma.
              </p>
              <div className="space-y-1.5">
                {FAN_SUGGESTION_RULES.map((r) => (
                  <div key={r.key} className="rounded-md border bg-muted/30 p-2.5">
                    <div className="text-sm font-medium">{r.title}</div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground/70">Se</span> {r.when}{" "}
                      <span className="font-semibold text-foreground/70">→</span> {r.then}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suas regras (custom) */}
          {!draft && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-semibold">Suas regras</h4>
              {rules.length === 0 ? (
                <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nenhuma ação programada ainda.
                </p>
              ) : (
                rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-2 rounded-md border bg-card p-3"
                  >
                    <label className="mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border"
                        checked={r.enabled}
                        onChange={(e) => toggleEnabled(r.id, e.target.checked)}
                        aria-label="Ativar regra"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {r.name?.trim() || "Regra sem nome"}
                        </span>
                        {!r.enabled && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            desativada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {describeTrigger(r.trigger)} → {describeAction(r.action)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Editar regra"
                        onClick={() => startEdit(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        aria-label="Excluir regra"
                        onClick={() => void handleRemove(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <Button size="sm" variant="outline" onClick={startNew}>
                <Plus className="h-4 w-4" /> Nova regra
              </Button>
            </div>
          )}

          {/* Editor de regra (nova/edição) */}
          {draft && (
            <RuleEditor
              draft={draft}
              perks={perks}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onConfirm={commitDraft}
            />
          )}

          {!draft && (
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RuleEditor({
  draft,
  perks,
  onChange,
  onCancel,
  onConfirm,
}: {
  draft: DraftRule;
  perks: FanClubPerkTemplate[];
  onChange: (d: DraftRule) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const set = <K extends keyof DraftRule>(key: K, value: DraftRule[K]) =>
    onChange({ ...draft, [key]: value });

  // Categorias e nomes de perk a partir do catálogo (loadFanClubConfig().perks).
  const perkCategories = useMemo(
    () => Array.from(new Set<string>(perks.map((p) => p.category))),
    [perks]
  );
  const perkNamesForCategory = useMemo(
    () => perks.filter((p) => p.category === draft.perkCategory).map((p) => p.name),
    [perks, draft.perkCategory]
  );

  const triggerHasDays = draft.triggerType !== "level_reached";
  const triggerHasOptionalLevel = draft.triggerType !== "level_reached";

  return (
    <div className="space-y-4 rounded-md border bg-card p-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nome (opcional)</label>
        <Input
          placeholder="Ex: Brinde de boas-vindas ao Superfã"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      {/* Gatilho */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-sm font-semibold">Se… (gatilho)</div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo de gatilho</label>
          <Select
            value={draft.triggerType}
            onValueChange={(v) => set("triggerType", v as TriggerType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="level_reached">Atingiu um nível</SelectItem>
              <SelectItem value="fan_for_days">É fã há X dias</SelectItem>
              <SelectItem value="inactive_days">Sem interação há X dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.triggerType === "level_reached" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nível (ou acima)</label>
            <LevelSelect value={draft.triggerLevel} onChange={(v) => set("triggerLevel", v)} />
          </div>
        )}

        {triggerHasOptionalLevel && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nível</label>
            <Select
              value={draft.triggerLevelAny ? "__any__" : draft.triggerLevel}
              onValueChange={(v) =>
                v === "__any__"
                  ? set("triggerLevelAny", true)
                  : onChange({ ...draft, triggerLevelAny: false, triggerLevel: v as FanLevel })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Qualquer nível</SelectItem>
                {FAN_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {triggerHasDays && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Dias</label>
            <Input
              type="number"
              min={1}
              value={draft.triggerDays}
              onChange={(e) => set("triggerDays", e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Ação */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-sm font-semibold">Então… (ação)</div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo de ação</label>
          <Select value={draft.actionType} onValueChange={(v) => set("actionType", v as ActionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grant_perk">Conceder perk</SelectItem>
              <SelectItem value="log_interaction">Registrar interação</SelectItem>
              <SelectItem value="create_task">Criar tarefa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.actionType === "grant_perk" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <Select
                value={draft.perkCategory}
                onValueChange={(v) => set("perkCategory", v as FanPerkCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Categorias do catálogo + fixas (para cobrir todas as opções). */}
                  {Array.from(new Set([...perkCategories, ...FAN_PERK_CATEGORIES])).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Perk</label>
              {perkNamesForCategory.length > 0 ? (
                <Select value={draft.perkName} onValueChange={(v) => set("perkName", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar perk…" />
                  </SelectTrigger>
                  <SelectContent>
                    {perkNamesForCategory.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nome do perk"
                  value={draft.perkName}
                  onChange={(e) => set("perkName", e.target.value)}
                />
              )}
            </div>
          </div>
        )}

        {draft.actionType === "log_interaction" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select
                value={draft.interactionType}
                onValueChange={(v) => set("interactionType", v as FanInteractionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAN_INTERACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nota (opcional)</label>
              <Input
                placeholder="Ex: Mensagem automática de boas-vindas"
                value={draft.interactionNote}
                onChange={(e) => set("interactionNote", e.target.value)}
              />
            </div>
          </div>
        )}

        {draft.actionType === "create_task" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Título da tarefa</label>
            <Input
              placeholder="Ex: Enviar brinde de fidelidade"
              value={draft.taskTitle}
              onChange={(e) => set("taskTitle", e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onConfirm}>Aplicar regra</Button>
      </div>
    </div>
  );
}

function LevelSelect({
  value,
  onChange,
}: {
  value: FanLevel;
  onChange: (v: FanLevel) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as FanLevel)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FAN_LEVELS.map((l) => (
          <SelectItem key={l} value={l}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
