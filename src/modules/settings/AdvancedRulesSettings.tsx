import { useEffect, useState } from "react";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
  BUILTIN_RULES,
  type BuiltinRule,
  type RuleCategory,
} from "@/modules/revisao/alerts";
import {
  getDisabledRuleIds,
  toggleRuleDisabled,
} from "@/modules/revisao/ruleConfig";
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

const CATEGORY_ORDER: RuleCategory[] = [
  "GIGs",
  "Produção",
  "Pessoas",
  "Tarefas",
  "Festas",
  "Aulas",
  "Objetivos",
  "Motivação",
];

/** Toggle acessível (não há componente Switch no projeto). */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Desligar regra" : "Ligar regra"}
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/**
 * Editor das regras de Insights/Alertas. Nesta primeira parte (base) o usuário
 * LIGA/DESLIGA as regras padrão do sistema; criar regras próprias vem a seguir.
 */
export function AdvancedRulesSettings() {
  const [disabled, setDisabled] = useState<Set<string>>(
    () => new Set(getDisabledRuleIds())
  );

  function toggle(id: string) {
    const willDisable = !disabled.has(id);
    setDisabled(new Set(toggleRuleDisabled(id, willDisable)));
  }

  const byCategory = new Map<RuleCategory, BuiltinRule[]>();
  for (const r of BUILTIN_RULES) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }
  const activeCount = BUILTIN_RULES.length - disabled.size;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Como funcionam os alertas e insights
          </CardTitle>
          <CardDescription>
            Cada regra observa seus dados e, quando a condição bate, mostra um
            alerta no sininho 🔔 e nos painéis de pendências.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            • <strong className="text-foreground">Desligar</strong> uma regra faz
            o alerta dela parar de aparecer — sem apagar nada do seu conteúdo.
          </p>
          <p>
            • Cada regra segue o formato{" "}
            <em>Se {"{"}condição{"}"} → Então {"{"}alerta{"}"}</em>, com
            operadores como <code>&lt;</code>, <code>&gt;</code>, <code>=</code> e
            “sem movimento há X dias”.
          </p>
          <p>
            • As mudanças viajam com o seu arquivo <code>.vistage</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras padrão</CardTitle>
          <CardDescription>
            {activeCount} de {BUILTIN_RULES.length} regras ativas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
            <div key={cat} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cat}
              </h4>
              <div className="space-y-1.5">
                {byCategory.get(cat)!.map((r) => {
                  const on = !disabled.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-2.5"
                    >
                      <span
                        className={cn(
                          "text-sm leading-snug",
                          !on && "text-muted-foreground line-through"
                        )}
                      >
                        {r.label}
                      </span>
                      <Toggle on={on} onClick={() => toggle(r.id)} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CustomRulesSection />
    </div>
  );
}

const SEVERITY_LABEL: Record<CustomRule["severity"], string> = {
  alerta: "Alerta",
  insight: "Insight",
};

/** Lista + criação/edição/remoção das regras próprias do usuário. */
function CustomRulesSection() {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRule | null>(null);

  const reload = () => void listCustomRules().then(setRules);
  useEffect(() => {
    reload();
  }, []);

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
            <CardTitle className="text-base">Minhas regras</CardTitle>
            <CardDescription>
              Crie alertas e insights próprios com operadores.
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
            Nenhuma regra própria ainda. Clique em “Nova regra” para criar a
            primeira.
          </div>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-md border p-2.5"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.severity === "alerta" ? "warning" : "secondary"}>
                    {SEVERITY_LABEL[r.severity]}
                  </Badge>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      !r.enabled && "text-muted-foreground line-through"
                    )}
                  >
                    {r.message}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {describeRule(r)} → mostra o alerta
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
        onSaved={() => {
          reload();
          emitDataChanged();
        }}
      />
    </Card>
  );
}

/** Formulário (dialog) de criação/edição de uma regra própria. */
function RuleFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomRule | null;
  onSaved: () => void;
}) {
  const [entity, setEntity] = useState<RuleEntityKey>("gig");
  const [field, setField] = useState<string>(RULE_ENTITIES[0].fields[0].key);
  const [operator, setOperator] = useState<RuleOperator>(
    OPERATORS_BY_TYPE[RULE_ENTITIES[0].fields[0].type][0].op
  );
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<CustomRule["severity"]>("alerta");
  const [saving, setSaving] = useState(false);

  // Recarrega o formulário sempre que abre (novo ou edição).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setEntity(editing.entity);
      setField(editing.field);
      setOperator(editing.operator);
      setValue(editing.value ?? "");
      setMessage(editing.message);
      setSeverity(editing.severity);
    } else {
      const e0 = RULE_ENTITIES[0];
      setEntity(e0.key);
      setField(e0.fields[0].key);
      setOperator(OPERATORS_BY_TYPE[e0.fields[0].type][0].op);
      setValue("");
      setMessage("");
      setSeverity("alerta");
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
      toast.error("Escreva a mensagem do alerta.");
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
          <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
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
            <Label className="text-xs">Então — mensagem do alerta</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ex: {n} GIG(s) com cachê vencido"
            />
            <p className="text-[11px] text-muted-foreground">
              Use <code>{"{n}"}</code> para inserir a quantidade.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as CustomRule["severity"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alerta">Alerta (urgente)</SelectItem>
                <SelectItem value="insight">Insight (recomendação)</SelectItem>
              </SelectContent>
            </Select>
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
