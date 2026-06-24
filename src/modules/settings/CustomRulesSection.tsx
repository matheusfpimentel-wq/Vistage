import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  createCustomRule,
  deleteCustomRule,
  describeRule,
  entityDef,
  fieldDef,
  listCustomRules,
  OPERATORS_BY_TYPE,
  operatorNeedsValue,
  RULE_ENTITIES,
  setCustomRuleEnabled,
  updateCustomRule,
  type CustomRule,
  type CustomRuleInput,
  type RuleEntityKey,
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
                ? "Quando a condição bate, vira um insight no banco (sem ir pro sininho)."
                : "Quando a condição bate, mostra um alerta no sininho."}
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
            Nenhuma regra ainda. Clique em “Nova regra” para criar a primeira.
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

/** Formulário (dialog) de criação/edição de uma regra própria (severidade fixa). */
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
  const [field, setField] = useState<string>(RULE_ENTITIES[0].fields[0].key);
  const [operator, setOperator] = useState<RuleOperator>(
    OPERATORS_BY_TYPE[RULE_ENTITIES[0].fields[0].type][0].op
  );
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setEntity(editing.entity);
      setField(editing.field);
      setOperator(editing.operator);
      setValue(editing.value ?? "");
      setMessage(editing.message);
    } else {
      const e0 = RULE_ENTITIES[0];
      setEntity(e0.key);
      setField(e0.fields[0].key);
      setOperator(OPERATORS_BY_TYPE[e0.fields[0].type][0].op);
      setValue("");
      setMessage("");
    }
  }, [open, editing]);

  const eDef = entityDef(entity);
  const fDef = eDef ? fieldDef(eDef, field) : undefined;
  const operators = fDef ? OPERATORS_BY_TYPE[fDef.type] : [];
  const needsValue = fDef ? operatorNeedsValue(fDef.type, operator) : false;

  function onEntityChange(next: RuleEntityKey) {
    setEntity(next);
    const e = entityDef(next);
    if (!e) return;
    const f0 = e.fields[0];
    setField(f0.key);
    setOperator(OPERATORS_BY_TYPE[f0.type][0].op);
  }

  function onFieldChange(nextKey: string) {
    setField(nextKey);
    if (!eDef) return;
    const f = fieldDef(eDef, nextKey);
    if (f) setOperator(OPERATORS_BY_TYPE[f.type][0].op);
  }

  async function save() {
    if (!message.trim()) {
      toast.error(`Escreva a mensagem do ${isInsight ? "insight" : "alerta"}.`);
      return;
    }
    if (needsValue && !value.trim()) {
      toast.error("Informe o valor da condição.");
      return;
    }
    const input: CustomRuleInput = {
      entity,
      field,
      operator,
      value: needsValue ? value.trim() : null,
      message: message.trim(),
      severity,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar regra" : isInsight ? "Nova regra de insight" : "Nova regra"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Se (entidade)</Label>
              <Select value={entity} onValueChange={(v) => onEntityChange(v as RuleEntityKey)}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label className="text-xs">Campo</Label>
              <Select value={field} onValueChange={onFieldChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eDef?.fields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={cn("grid gap-2", needsValue ? "grid-cols-2" : "grid-cols-1")}>
            <div className="space-y-1">
              <Label className="text-xs">Condição</Label>
              <Select value={operator} onValueChange={(v) => setOperator(v as RuleOperator)}>
                <SelectTrigger>
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
            </div>
            {needsValue && (
              <div className="space-y-1">
                <Label className="text-xs">Valor</Label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="ex: 15"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Então — mensagem do {isInsight ? "insight" : "alerta"}
            </Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                isInsight ? "ex: {n} GIGs de cachê alto este mês" : "ex: {n} GIG(s) com cachê vencido"
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Use <code>{"{n}"}</code> para inserir a quantidade.
            </p>
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
  );
}
