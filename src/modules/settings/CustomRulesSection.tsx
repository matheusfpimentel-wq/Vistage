import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { SEVERITY_LABEL, type AlertSeverity } from "@/modules/revisao/alerts";
import {
  createCustomRule,
  decodeStateDays,
  deleteCustomRule,
  describeRule,
  encodeStateDays,
  entityDef,
  fieldDef,
  listCustomRules,
  OPERATORS_BY_TYPE,
  RULE_ENTITIES,
  setCustomRuleEnabled,
  updateCustomRule,
  type CustomRule,
  type CustomRuleInput,
  type RuleCondition,
  type RuleEntityDef,
  type RuleEntityKey,
  type RuleMatch,
  type RuleOperator,
} from "@/modules/revisao/customRules";
import { emitDataChanged } from "@/lib/events";

/** Toggle acessível (não há componente Switch no projeto). */
export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Desligar" : "Ligar"}
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

/**
 * Lista + CRUD das regras próprias do usuário, filtradas por SEVERIDADE:
 * - "alerta" → aparecem no sininho (aba Alertas).
 * - "insight" → viram insights no banco (aba Insights), sem ir pro sininho.
 */
export function CustomRulesSection({ severity }: { severity: CustomRule["severity"] }) {
  const isInsight = severity === "insight";
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRule | null>(null);

  const reload = () =>
    void listCustomRules().then((rs) => setRules(rs.filter((r) => r.severity === severity)));
  useEffect(() => {
    reload();
  }, [severity]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleEnabled(rule: CustomRule) {
    await setCustomRuleEnabled(rule.id, !rule.enabled);
    reload();
    emitDataChanged();
  }

  async function remove(rule: CustomRule) {
    if (
      !(await confirmDialog({
        title: "Excluir regra",
        description: `Remover a regra "${rule.message}"?`,
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteCustomRule(rule.id);
    toast.success("Regra removida");
    reload();
    emitDataChanged();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {isInsight ? "Minhas regras de insight" : "Minhas regras"}
            </CardTitle>
            <CardDescription>
              {isInsight
                ? "Quando as condições batem, vira um insight no banco (sem ir pro sininho)."
                : "Monte a regra: SE (uma ou mais condições, com E/OU) ENTÃO mostra um alerta no sininho."}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma regra ainda. Clique em "Nova regra" para criar a primeira.
          </div>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-md border p-2.5"
            >
              <div className="min-w-0 space-y-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    !r.enabled && "text-muted-foreground line-through"
                  )}
                >
                  {r.message}
                  {!!r.dismissible && !isInsight && (
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                      (dispensável)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {describeRule(r)} → {isInsight ? "vira insight" : "mostra o alerta"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Toggle on={!!r.enabled} onClick={() => void toggleEnabled(r)} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Editar"
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  aria-label="Excluir"
                  onClick={() => void remove(r)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <RuleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        severity={severity}
        onSaved={() => {
          reload();
          emitDataChanged();
        }}
      />
    </Card>
  );
}

/** Uma linha de condição: campo · operador · valor (adaptável). */
function ConditionRow({
  entityKey,
  cond,
  onChange,
  onRemove,
  canRemove,
}: {
  entityKey: RuleEntityKey;
  cond: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const eDef = entityDef(entityKey);
  const fDef = eDef ? fieldDef(eDef, cond.field) : undefined;
  const operators = fDef ? OPERATORS_BY_TYPE[fDef.type] : [];
  const opMeta = operators.find((o) => o.op === cond.operator);
  const needsValue = opMeta?.needsValue ?? false;
  const valueKind = opMeta?.valueKind ?? "none";
  const options = fDef?.options ?? [];
  const { state: stateVal, days: daysVal } = decodeStateDays(cond.value);

  function changeField(field: string) {
    const nf = eDef ? fieldDef(eDef, field) : undefined;
    const op = nf ? OPERATORS_BY_TYPE[nf.type][0].op : cond.operator;
    onChange({ field, operator: op, value: null });
  }
  const setValue = (value: string | null) => onChange({ ...cond, value });

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center gap-1.5">
        <Select value={cond.field} onValueChange={changeField}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {eDef?.fields.map((fd) => (
              <SelectItem key={fd.key} value={fd.key}>
                {fd.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={onRemove}
            aria-label="Remover condição"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <Select
        value={cond.operator}
        onValueChange={(v) => onChange({ ...cond, operator: v as RuleOperator, value: null })}
      >
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((o) => (
            <SelectItem key={o.op} value={o.op}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue && valueKind === "number" && (
        <Input
          type="number"
          className="h-8"
          value={cond.value ?? ""}
          onChange={(ev) => setValue(ev.target.value)}
          placeholder="ex: 15"
        />
      )}
      {needsValue && valueKind === "text" && (
        <Input
          className="h-8"
          value={cond.value ?? ""}
          onChange={(ev) => setValue(ev.target.value)}
          placeholder="ex: pendente"
        />
      )}
      {needsValue && valueKind === "enum" && (
        <Select value={cond.value ?? ""} onValueChange={setValue}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Escolha…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {needsValue && valueKind === "state_days" && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={stateVal} onValueChange={(v) => setValue(encodeStateDays(v, daysVal))}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Estado…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            className="h-8"
            value={daysVal}
            onChange={(ev) => setValue(encodeStateDays(stateVal, ev.target.value))}
            placeholder="dias"
          />
        </div>
      )}
    </div>
  );
}

/** Janela de ajuda: lista os campos da entidade (rótulo + nome cru da coluna). */
function FieldHelpDialog({
  open,
  onOpenChange,
  entity,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: RuleEntityDef | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Campos de {entity?.label ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {entity?.fields.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm"
            >
              <span>{f.label}</span>
              <code className="text-xs text-muted-foreground">{f.column}</code>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function defaultCondition(entKey: RuleEntityKey): RuleCondition {
  const e = entityDef(entKey);
  const f0 = e?.fields[0];
  if (!f0) return { field: "", operator: "filled", value: null };
  return { field: f0.key, operator: OPERATORS_BY_TYPE[f0.type][0].op, value: null };
}

/** Formulário (dialog) de criação/edição: editor SE / ENTÃO em 2 colunas. */
function RuleFormDialog({
  open,
  onOpenChange,
  editing,
  severity,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomRule | null;
  severity: CustomRule["severity"];
  onSaved: () => void;
}) {
  const isInsight = severity === "insight";
  const [entity, setEntity] = useState<RuleEntityKey>("gig");
  const [conditions, setConditions] = useState<RuleCondition[]>([defaultCondition("gig")]);
  const [match, setMatch] = useState<RuleMatch>("all");
  const [message, setMessage] = useState("");
  const [dismissible, setDismissible] = useState(false);
  const [severidade, setSeveridade] = useState<AlertSeverity>("atencao");
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setEntity(editing.entity);
      setConditions(editing.conditions.length ? editing.conditions : [defaultCondition(editing.entity)]);
      setMatch(editing.match);
      setMessage(editing.message);
      setDismissible(!!editing.dismissible);
      setSeveridade(editing.severidade);
    } else {
      setEntity("gig");
      setConditions([defaultCondition("gig")]);
      setMatch("all");
      setMessage("");
      setDismissible(false);
      setSeveridade("atencao");
    }
  }, [open, editing]);

  function onEntityChange(next: RuleEntityKey) {
    setEntity(next);
    setConditions([defaultCondition(next)]);
  }

  function validCondition(c: RuleCondition): boolean {
    const e = entityDef(entity);
    const f = e ? fieldDef(e, c.field) : undefined;
    if (!f) return false;
    const opMeta = OPERATORS_BY_TYPE[f.type].find((o) => o.op === c.operator);
    if (!opMeta) return false;
    if (!opMeta.needsValue) return true;
    if (opMeta.valueKind === "state_days") {
      const { state, days } = decodeStateDays(c.value);
      return !!state && !!days.trim() && Number.isFinite(Number(days));
    }
    return !!(c.value && c.value.trim());
  }

  async function save() {
    if (!message.trim()) {
      toast.error(`Escreva a mensagem do ${isInsight ? "insight" : "alerta"}.`);
      return;
    }
    if (conditions.length === 0 || !conditions.every(validCondition)) {
      toast.error("Complete as condições (campo, condição e valor).");
      return;
    }
    const input: CustomRuleInput = {
      entity,
      conditions,
      match,
      message: message.trim(),
      severity,
      severidade: isInsight ? undefined : severidade,
      dismissible: !isInsight && dismissible ? 1 : 0,
    };
    setSaving(true);
    try {
      if (editing) await updateCustomRule(editing.id, input);
      else await createCustomRule(input);
      toast.success(editing ? "Regra atualizada" : "Regra criada");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const eDef = entityDef(entity);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar regra" : isInsight ? "Nova regra de insight" : "Nova regra"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-2">
            {/* ── SE ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide">Se</Label>
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="flex h-5 w-5 items-center justify-center rounded-full border text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  title="Ver os nomes dos campos"
                  aria-label="Ajuda: nomes dos campos"
                >
                  ?
                </button>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Entidade</Label>
                <Select value={entity} onValueChange={(v) => onEntityChange(v as RuleEntityKey)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_ENTITIES.map((e) => (
                      <SelectItem key={e.key} value={e.key}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {conditions.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Combinar:</span>
                  {(["all", "any"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMatch(m)}
                      className={cn("seg-pill", match === m ? "seg-pill-on" : "seg-pill-off")}
                    >
                      {m === "all" ? "Todas (E)" : "Qualquer (OU)"}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={i} className="space-y-1">
                    {i > 0 && (
                      <div className="text-center text-[10px] font-semibold uppercase text-muted-foreground">
                        {match === "any" ? "ou" : "e"}
                      </div>
                    )}
                    <ConditionRow
                      entityKey={entity}
                      cond={c}
                      onChange={(nc) =>
                        setConditions((cs) => cs.map((x, idx) => (idx === i ? nc : x)))
                      }
                      onRemove={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
                      canRemove={conditions.length > 1}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConditions((cs) => [...cs, defaultCondition(entity)])}
                >
                  <Plus className="h-3.5 w-3.5" /> Condição
                </Button>
              </div>
            </div>

            {/* ── ENTÃO ── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide">Então</Label>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Mensagem do {isInsight ? "insight" : "alerta"}
                </Label>
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={isInsight ? "ex: {n} GIGs de cachê alto" : "ex: Entregar kit de embaixador"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Use <code>{"{n}"}</code> pra inserir a quantidade.
                </p>
              </div>
              {!isInsight && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Prioridade</Label>
                  <div className="flex gap-1.5">
                    {(["critico", "atencao", "info"] as AlertSeverity[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeveridade(s)}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1.5 text-xs transition",
                          severidade === s
                            ? s === "critico"
                              ? "border-red-500/50 bg-red-500/10 font-medium text-red-600 dark:text-red-400"
                              : s === "atencao"
                              ? "border-amber-500/50 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
                              : "border-primary/40 bg-primary/10 font-medium"
                            : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {SEVERITY_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!isInsight && (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dismissible}
                    onChange={(e) => setDismissible(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Desaparecer ao clicar (dispensar no sininho)
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FieldHelpDialog open={helpOpen} onOpenChange={setHelpOpen} entity={eDef} />
    </>
  );
}
