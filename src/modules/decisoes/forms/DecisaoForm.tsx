import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  DECISION_DOMAINS,
  OUTCOME_EVALUATIONS,
  createDecision,
  updateDecision,
  type Decision,
  type DecisionDomain,
  type OutcomeEvaluation,
} from "../api";
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  decision?: Decision | null;
  onSaved: () => void;
};

const EMPTY = {
  context: "",
  options_considered: "",
  decision_made: "",
  reasoning: "",
  domain: "Negócios" as DecisionDomain,
  outcome: "",
  outcome_evaluation: null as OutcomeEvaluation | null,
  learned: "",
};

export function DecisaoForm({ open, onOpenChange, decision, onSaved }: Props) {
  const [state, setState] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (decision) {
      setState({
        context: decision.context,
        options_considered: decision.options_considered ?? "",
        decision_made: decision.decision_made,
        reasoning: decision.reasoning ?? "",
        domain: decision.domain,
        outcome: decision.outcome ?? "",
        outcome_evaluation: decision.outcome_evaluation,
        learned: decision.learned ?? "",
      });
    } else {
      setState(EMPTY);
    }
    setDirty(false);
  }, [decision, open]);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    if (!state.context.trim()) { toast.error("Contexto obrigatório"); return; }
    if (!state.decision_made.trim()) { toast.error("Decisão tomada obrigatória"); return; }
    setSaving(true);
    try {
      const input = {
        context: state.context,
        options_considered: state.options_considered || null,
        decision_made: state.decision_made,
        reasoning: state.reasoning || null,
        domain: state.domain,
        outcome: state.outcome || null,
        outcome_evaluation: state.outcome_evaluation,
        learned: state.learned || null,
      };
      if (decision) {
        await updateDecision({ id: decision.id, ...input });
        toast.success("Decisão atualizada");
      } else {
        await createDecision(input);
        toast.success("Decisão registrada");
      }
      setDirty(false);
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const isUpdate = !!decision;

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isUpdate ? "Editar decisão" : "Registrar decisão"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Domínio">
              <Select value={state.domain} onValueChange={(v) => set("domain", v as DecisionDomain)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DECISION_DOMAINS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Contexto *">
            <Textarea
              rows={2}
              value={state.context}
              onChange={(e) => set("context", e.target.value)}
              placeholder="Qual era a situação? O que estava em jogo?"
            />
          </Field>

          <Field label="Opções consideradas">
            <Textarea
              rows={2}
              value={state.options_considered}
              onChange={(e) => set("options_considered", e.target.value)}
              placeholder="Quais alternativas você avaliou?"
            />
          </Field>

          <Field label="Decisão tomada *">
            <Input
              value={state.decision_made}
              onChange={(e) => set("decision_made", e.target.value)}
              placeholder="O que você decidiu fazer?"
            />
          </Field>

          <Field label="Raciocínio">
            <Textarea
              rows={2}
              value={state.reasoning}
              onChange={(e) => set("reasoning", e.target.value)}
              placeholder="Por que essa opção? Que critérios você usou?"
            />
          </Field>

          {isUpdate && (
            <>
              <div className="border-t pt-3">
                <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Revisão posterior</p>
              </div>
              <Field label="Outcome (o que aconteceu)">
                <Textarea
                  rows={2}
                  value={state.outcome}
                  onChange={(e) => set("outcome", e.target.value)}
                  placeholder="Como essa decisão se desdobrou na prática?"
                />
              </Field>
              <Field label="Avaliação">
                <Select
                  value={state.outcome_evaluation ?? "none"}
                  onValueChange={(v) => set("outcome_evaluation", v === "none" ? null : v as OutcomeEvaluation)}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem avaliação —</SelectItem>
                    {OUTCOME_EVALUATIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Aprendizado">
                <Textarea
                  rows={2}
                  value={state.learned}
                  onChange={(e) => set("learned", e.target.value)}
                  placeholder="O que você faria diferente? O que vai replicar?"
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {isUpdate ? "Salvar alterações" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
