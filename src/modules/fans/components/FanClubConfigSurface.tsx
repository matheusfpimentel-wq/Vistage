import { useEffect, useMemo, useState } from "react";
import { HelpCircle, Megaphone, Pencil, Plus, Settings2, Sparkles, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useModuleView } from "@/lib/moduleView";
import {
  loadFanAutoRules,
  loadFanClubConfig,
  loadFanUpgradeRules,
  recomputeAllFanLevels,
  runFanAutoRules,
  saveFanAutoRules,
  saveFanClubConfig,
  saveFanUpgradeRules,
} from "../api";
import { FAN_SUGGESTION_RULES } from "../suggestions";
import {
  FAN_INTERACTION_TYPES,
  FAN_LEVELS,
  FAN_PERK_CATEGORIES,
  type FanAutoRule,
  type FanClubAction,
  type FanClubPerkTemplate,
  type FanInteractionType,
  type FanLevel,
  type FanPerkCategory,
  type FanRuleAction,
  type FanRuleTrigger,
  type FanScoreThresholds,
  type FanScoringConfig,
  type FanUpgradeRules,
} from "../types";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ConfigTopic = "scoring" | "actions" | "autoRules";

const TOPICS: { key: ConfigTopic; label: string; icon: typeof Settings2 }[] = [
  { key: "scoring", label: "Pontuação e níveis", icon: Settings2 },
  { key: "actions", label: "Ações rápidas e perks", icon: Megaphone },
  { key: "autoRules", label: "Ações programadas", icon: Zap },
];

/**
 * Superfície "Configurar clube": um MENU (não mais 3 cards que abrem 3 diálogos
 * separados) — escolhe o tema à esquerda, o painel aparece na hora ao lado, sem
 * pulo pra modal. A escolha é uma preferência de tela (useModuleView) e por isso
 * "reabre aberto": voltar pra essa aba mostra direto o último tema editado, em
 * vez de sempre cair na tela neutra de escolha.
 */
export function FanClubConfigSurface() {
  const [topic, setTopic] = useModuleView<ConfigTopic>("fans-config-topic", "scoring");
  const [dirty, setDirty] = useState(false);

  async function switchTopic(next: ConfigTopic) {
    if (next === topic) return;
    if (dirty) {
      const ok = await confirmDialog({
        title: "Descartar alterações?",
        description: "Há mudanças não salvas neste tema. Trocar de tema descarta o que não foi salvo.",
        confirmLabel: "Descartar e trocar",
        destructive: true,
      });
      if (!ok) return;
    }
    setDirty(false);
    setTopic(next);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[200px_1fr] sm:items-start">
      <div className="flex gap-1.5 overflow-x-auto sm:flex-col sm:overflow-visible">
        {TOPICS.map((t) => {
          const active = topic === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => void switchTopic(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition sm:shrink-0",
                active
                  ? "border-primary bg-primary/5 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              aria-current={active ? "true" : undefined}
            >
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-w-0 rounded-lg border bg-card p-4">
        {topic === "scoring" && <ScoringPanel onDirtyChange={setDirty} />}
        {topic === "actions" && <ActionsPerksPanel onDirtyChange={setDirty} />}
        {topic === "autoRules" && <AutoRulesPanel onDirtyChange={setDirty} />}
      </div>
    </div>
  );
}

// ─────────────────────────── Pontuação e níveis ────────────────────────────

type ScoringState = {
  weightPresenca: string;
  weightFeedback: string;
  weightInteracao: string;
  weightGig: string;
  weightCompra: string;
  weightIndicacao: string;
  halfLifeDays: string;
  thQuaseFa: string;
  thFa: string;
  thSuperfa: string;
  thEmbaixador: string;
};

const emptyScoring = (): ScoringState => ({
  weightPresenca: "",
  weightFeedback: "",
  weightInteracao: "",
  weightGig: "",
  weightCompra: "",
  weightIndicacao: "",
  halfLifeDays: "",
  thQuaseFa: "",
  thFa: "",
  thSuperfa: "",
  thEmbaixador: "",
});

function scoringToState(s?: FanScoringConfig): ScoringState {
  const v = (n?: number) => (n != null ? String(n) : "");
  return {
    weightPresenca: v(s?.weightPresenca),
    weightFeedback: v(s?.weightFeedback),
    weightInteracao: v(s?.weightInteracao),
    weightGig: v(s?.weightGig),
    weightCompra: v(s?.weightCompra),
    weightIndicacao: v(s?.weightIndicacao),
    halfLifeDays: v(s?.halfLifeDays),
    thQuaseFa: v(s?.thresholds?.quaseFa),
    thFa: v(s?.thresholds?.fa),
    thSuperfa: v(s?.thresholds?.superfa),
    thEmbaixador: v(s?.thresholds?.embaixador),
  };
}

function stateToScoring(s: ScoringState): FanScoringConfig {
  const num = (x: string): number | undefined => {
    const t = x.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  const scoring: FanScoringConfig = {};
  const wp = num(s.weightPresenca); if (wp != null) scoring.weightPresenca = wp;
  const wf = num(s.weightFeedback); if (wf != null) scoring.weightFeedback = wf;
  const wi = num(s.weightInteracao); if (wi != null) scoring.weightInteracao = wi;
  const wg = num(s.weightGig); if (wg != null) scoring.weightGig = wg;
  const wc = num(s.weightCompra); if (wc != null) scoring.weightCompra = wc;
  const wid = num(s.weightIndicacao); if (wid != null) scoring.weightIndicacao = wid;
  const hl = num(s.halfLifeDays); if (hl != null) scoring.halfLifeDays = hl;
  const thresholds: FanScoreThresholds = {};
  const tq = num(s.thQuaseFa); if (tq != null) thresholds.quaseFa = tq;
  const tf = num(s.thFa); if (tf != null) thresholds.fa = tf;
  const ts = num(s.thSuperfa); if (ts != null) thresholds.superfa = ts;
  const te = num(s.thEmbaixador); if (te != null) thresholds.embaixador = te;
  if (Object.keys(thresholds).length) scoring.thresholds = thresholds;
  return scoring;
}

function ScoreField({
  label,
  value,
  placeholder,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-sm font-medium">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </label>
      <Input
        type="number"
        min={0}
        placeholder={`padrão: ${placeholder}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ScoringPanel({ onDirtyChange }: { onDirtyChange: (v: boolean) => void }) {
  const [s, setS] = useState<ScoringState>(emptyScoring());
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);

  useEffect(() => {
    void loadFanUpgradeRules().then((r: FanUpgradeRules) => setS(scoringToState(r.scoring)));
  }, []);

  const set = (key: keyof ScoringState) => (v: string) => {
    setS((prev) => ({ ...prev, [key]: v }));
    onDirtyChange(true);
  };

  async function persist(): Promise<void> {
    const current = await loadFanUpgradeRules();
    await saveFanUpgradeRules({ ...current, scoring: stateToScoring(s) });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await persist();
      onDirtyChange(false);
      toast.success("Pontuação salva");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalc() {
    setRecalcing(true);
    try {
      await persist(); // recalcula já com os pesos atuais da tela
      const changed = await recomputeAllFanLevels();
      // Dispara as ações programadas logo após o recálculo, pra que regras de
      // "atingiu nível X" reajam aos novos níveis na hora. Idempotente.
      await runFanAutoRules().catch(() => 0);
      onDirtyChange(false);
      toast.success(changed > 0 ? `${changed} nível(is) atualizado(s)` : "Nenhum nível mudou");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setRecalcing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        Pontuação de engajamento dos fãs
        <InfoHint>
          O nível de cada fã é calculado por uma pontuação que decai com o
          tempo: cada sinal vale pontos e perde peso conforme envelhece. Campos
          vazios usam o padrão.
        </InfoHint>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Pesos por sinal</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ScoreField label="Presença" value={s.weightPresenca} placeholder="3" onChange={set("weightPresenca")} />
          <ScoreField label="Feedback" value={s.weightFeedback} placeholder="2" onChange={set("weightFeedback")} />
          <ScoreField label="Interação" value={s.weightInteracao} placeholder="1" onChange={set("weightInteracao")} />
          <ScoreField label="Presença em GIG" value={s.weightGig} placeholder="3" onChange={set("weightGig")} />
          <ScoreField label="Compra (ingresso/merch)" value={s.weightCompra} placeholder="4" onChange={set("weightCompra")} />
          <ScoreField label="Indicação" value={s.weightIndicacao} placeholder="3" onChange={set("weightIndicacao")} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Decaimento</div>
        <ScoreField
          label="Meia-vida (dias)"
          value={s.halfLifeDays}
          placeholder="180"
          onChange={set("halfLifeDays")}
          hint="Um sinal com essa idade vale metade dos pontos."
        />
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Limiares (pontos para cada nível)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ScoreField label="Fã" value={s.thFa} placeholder="5" onChange={set("thFa")} />
          <ScoreField label="Superfã" value={s.thSuperfa} placeholder="12" onChange={set("thSuperfa")} />
        </div>
        <p className="text-xs text-muted-foreground">
          Embaixador não entra na pontuação: é um destaque manual no cadastro do fã.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleRecalc} disabled={recalcing || saving}>
          {recalcing ? "Recalculando…" : "Recalcular todos agora"}
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving || recalcing}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Ações rápidas e perks ─────────────────────────

function ActionsPerksPanel({ onDirtyChange }: { onDirtyChange: (v: boolean) => void }) {
  const [actions, setActions] = useState<FanClubAction[]>([]);
  const [perks, setPerks] = useState<FanClubPerkTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadFanClubConfig().then((c) => {
      setActions(c.actions);
      setPerks(c.perks);
    });
  }, []);

  function setAction(id: string, patch: Partial<FanClubAction>) {
    setActions((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    onDirtyChange(true);
  }
  function setPerk(id: string, patch: Partial<FanClubPerkTemplate>) {
    setPerks((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    onDirtyChange(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFanClubConfig({
        actions: actions.filter((a) => a.label.trim() && a.titleTemplate.trim()),
        perks: perks.filter((p) => p.name.trim()),
      });
      onDirtyChange(false);
      toast.success("Configuração do clube salva");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Ações rápidas */}
      <section className="space-y-2">
        <div className="text-sm font-semibold">Ações rápidas</div>
        <p className="text-xs text-muted-foreground">
          Botões que aparecem em cada fã (viram tarefa). Use <code>{"{nome}"}</code> para inserir o nome do fã.
        </p>
        <div className="space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
              <Input
                placeholder="Rótulo (ex: Reativar fã)"
                value={a.label}
                onChange={(e) => setAction(a.id, { label: e.target.value })}
              />
              <Input
                placeholder="Tarefa (ex: Reativar contato com {nome})"
                value={a.titleTemplate}
                onChange={(e) => setAction(a.id, { titleTemplate: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover ação"
                onClick={() => {
                  setActions((as) => as.filter((x) => x.id !== a.id));
                  onDirtyChange(true);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setActions((as) => [...as, { id: uid(), label: "", titleTemplate: "" }]);
            onDirtyChange(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nova ação
        </Button>
      </section>

      {/* Catálogo de perks */}
      <section className="space-y-2">
        <div className="text-sm font-semibold">Catálogo de perks / brindes</div>
        <p className="text-xs text-muted-foreground">
          Atalhos para adicionar perks na aba do fã com um clique.
        </p>
        <div className="space-y-2">
          {perks.map((p) => (
            <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-center">
              <Select value={p.category} onValueChange={(v) => setPerk(p.id, { category: v as FanPerkCategory })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAN_PERK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Perk (ex: Vinil autografado)"
                value={p.name}
                onChange={(e) => setPerk(p.id, { name: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover perk"
                onClick={() => {
                  setPerks((ps) => ps.filter((x) => x.id !== p.id));
                  onDirtyChange(true);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPerks((ps) => [...ps, { id: uid(), category: "Brinde", name: "" }]);
            onDirtyChange(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo perk
        </Button>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Ações programadas ─────────────────────────────

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

function AutoRulesPanel({ onDirtyChange }: { onDirtyChange: (v: boolean) => void }) {
  const [rules, setRules] = useState<FanAutoRule[]>([]);
  const [perks, setPerks] = useState<FanClubPerkTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // draft != null → editor aberto (nova regra ou edição de uma existente).
  const [draft, setDraft] = useState<DraftRule | null>(null);

  useEffect(() => {
    void loadFanAutoRules().then(setRules);
    void loadFanClubConfig().then((c) => setPerks(c.perks));
  }, []);

  // Conta como sujo tanto uma regra alterada/removida quanto um rascunho em
  // edição (nova regra ou edição de existente) ainda não aplicado.
  useEffect(() => {
    onDirtyChange(draft !== null);
  }, [draft, onDirtyChange]);

  function startNew() {
    setDraft(emptyDraft());
  }
  function startEdit(r: FanAutoRule) {
    setDraft(ruleToDraft(r));
  }

  function toggleEnabled(id: string, enabled: boolean) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
    onDirtyChange(true);
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
    onDirtyChange(true);
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
    onDirtyChange(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFanAutoRules(rules);
      onDirtyChange(false);
      toast.success("Ações programadas salvas");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-primary" /> Ações programadas
        </div>
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
      <p className="-mt-2 text-xs text-muted-foreground">
        Componha regras "se… então…" que rodam automaticamente sobre seus fãs.
      </p>
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
        <div className="flex justify-end border-t pt-3">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}
    </div>
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
