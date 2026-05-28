import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import {
  GIG_STATUSES,
  PAYMENT_STATUSES,
  type Gig,
  type GigCreateInput,
} from "../types";
import { createGig, updateGig } from "../api";
import { ensureGigPaymentTransaction } from "@/modules/finance/api";
import { loadAuth, pushGigToCalendar } from "@/lib/gcal";
import { todayISO } from "@/lib/format";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gig?: Gig | null;
  /** Pré-preenche o promoter_contact_id ao abrir em modo criar. */
  prefillPromoter?: Contact | null;
  onSaved: (gig: { id: number; statusChanged: boolean; isNew: boolean }) => void;
};

type FormState = Omit<GigCreateInput, "id">;

const EMPTY: FormState = {
  date: todayISO(),
  start_time: null,
  end_time: null,
  venue_name: "",
  venue_city: null,
  venue_address: null,
  promoter_contact_id: null,
  day_contact_name: null,
  day_contact_phone: null,
  estimated_audience: null,
  cache_amount: null,
  script_file_path: null,
  banner_file_path: null,
  opportunities: null,
  briefing: null,
  set_concept: null,
  concrete_goals: null,
  targets: null,
  status: "Proposta",
  transport: null,
  departure_time: null,
  equipment_provided: null,
  equipment_to_bring: null,
  related_expenses: null,
  payment_method: null,
  payment_status: "Pendente",
  payment_due_date: null,
  invoice_file_path: null,
  general_notes: null,
  debrief_strengths: null,
  debrief_weaknesses: null,
  debrief_learnings: null,
  debrief_opportunities_used: null,
  debrief_future_opportunities: null,
  debrief_promoter_feedback: null,
  debrief_technical_notes: null,
  debrief_media_content: null,
  rating_charisma: null,
  rating_charisma_note: null,
  rating_technique: null,
  rating_technique_note: null,
  rating_repertoire: null,
  rating_repertoire_note: null,
  gcal_event_id: null,
};

function gigToState(gig: Gig): FormState {
  const { id: _id, created_at: _c, updated_at: _u, debrief_pending: _dp, debrief_completed_at: _dca, ...rest } = gig;
  return rest;
}

export function GigForm({
  open,
  onOpenChange,
  gig,
  prefillPromoter,
  onSaved,
}: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ date?: string; venue_name?: string }>({});
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (gig) setState(gigToState(gig));
    else if (prefillPromoter)
      setState({
        ...EMPTY,
        promoter_contact_id: prefillPromoter.id,
        venue_city: prefillPromoter.city,
      });
    else setState(EMPTY);
    setErrors({});
  }, [gig, prefillPromoter, open]);

  useEffect(() => {
    if (!open) return;
    void listContacts().then(setContacts);
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!state.date) e.date = "Obrigatório";
    if (!state.venue_name.trim()) e.venue_name = "Obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const prevStatus = gig?.status;
      let savedId: number;
      if (gig) {
        await updateGig({ id: gig.id, ...state });
        savedId = gig.id;
        toast.success("GIG atualizada");
        onSaved({
          id: savedId,
          statusChanged: prevStatus !== state.status,
          isNew: false,
        });
      } else {
        savedId = await createGig(state);
        toast.success("GIG criada");
        onSaved({ id: savedId, statusChanged: false, isNew: true });
      }
      // Auto-vínculo financeiro: pagamento integral → cria receita na
      // categoria DJ vinculada à GIG (idempotente)
      if (
        state.payment_status === "Pago integralmente" &&
        typeof state.cache_amount === "number" &&
        state.cache_amount > 0
      ) {
        try {
          await ensureGigPaymentTransaction(
            savedId,
            state.cache_amount,
            state.payment_due_date ?? state.date,
            `Cachê — ${state.venue_name}`
          );
        } catch {
          /* não interrompe o usuário */
        }
      }

      // Push para Google Calendar se conectado e com calendário escolhido
      try {
        const auth = await loadAuth();
        if (auth?.access_token && auth.calendar_id) {
          await pushGigToCalendar(savedId);
        }
      } catch (e) {
        toast.error(`GIG salva, mas sync com Google Calendar falhou: ${String(e)}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Erro ao salvar: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{gig ? "Editar GIG" : "Nova GIG"}</DialogTitle>
          <DialogDescription>
            Preencha os blocos abaixo. O Debrief (Pós-show) é solicitado
            automaticamente quando você muda o status para Concluída.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pre" className="w-full">
          <TabsList>
            <TabsTrigger value="pre">Pré-evento</TabsTrigger>
            <TabsTrigger value="logistics">Logística & Financeiro</TabsTrigger>
          </TabsList>

          {/* ============ PRÉ-EVENTO ============ */}
          <TabsContent value="pre" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Data" required error={errors.date}>
                <Input
                  type="date"
                  value={state.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label="Início do set">
                <Input
                  type="time"
                  value={state.start_time ?? ""}
                  onChange={(e) => set("start_time", e.target.value || null)}
                />
              </Field>
              <Field label="Fim do set">
                <Input
                  type="time"
                  value={state.end_time ?? ""}
                  onChange={(e) => set("end_time", e.target.value || null)}
                />
              </Field>
            </div>

            <Field label="Venue (local)" required error={errors.venue_name}>
              <Input
                placeholder="Ex: Audio Club"
                value={state.venue_name}
                onChange={(e) => set("venue_name", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cidade">
                <Input
                  value={state.venue_city ?? ""}
                  onChange={(e) => set("venue_city", e.target.value || null)}
                />
              </Field>
              <Field label="Endereço">
                <Input
                  value={state.venue_address ?? ""}
                  onChange={(e) => set("venue_address", e.target.value || null)}
                />
              </Field>
            </div>

            <Field label="Promoter / Contratante (do CRM)">
              <Select
                value={state.promoter_contact_id?.toString() ?? "none"}
                onValueChange={(v) =>
                  set("promoter_contact_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um contato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem vínculo —</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                      {c.city ? ` · ${c.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Contato no dia">
                <Input
                  value={state.day_contact_name ?? ""}
                  onChange={(e) =>
                    set("day_contact_name", e.target.value || null)
                  }
                />
              </Field>
              <Field label="Telefone do contato">
                <Input
                  value={state.day_contact_phone ?? ""}
                  onChange={(e) =>
                    set("day_contact_phone", e.target.value || null)
                  }
                />
              </Field>
              <Field label="Público estimado">
                <Input
                  type="number"
                  min={0}
                  value={state.estimated_audience ?? ""}
                  onChange={(e) =>
                    set(
                      "estimated_audience",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cachê (R$)">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={state.cache_amount ?? ""}
                  onChange={(e) =>
                    set(
                      "cache_amount",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
              <Field label="Status">
                <Select
                  value={state.status}
                  onValueChange={(v) => set("status", v as Gig["status"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GIG_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Briefing — o que o contratante pediu / contexto do evento">
              <Textarea
                rows={3}
                value={state.briefing ?? ""}
                onChange={(e) => set("briefing", e.target.value || null)}
              />
            </Field>

            <Field label="Conceito do set — direção artística, vibe, narrativa">
              <Textarea
                rows={3}
                value={state.set_concept ?? ""}
                onChange={(e) => set("set_concept", e.target.value || null)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Objetivos concretos — o que quero conquistar">
                <Textarea
                  rows={3}
                  value={state.concrete_goals ?? ""}
                  onChange={(e) =>
                    set("concrete_goals", e.target.value || null)
                  }
                />
              </Field>
              <Field label="Alvos — pessoas, contatos, marcas a atingir">
                <Textarea
                  rows={3}
                  value={state.targets ?? ""}
                  onChange={(e) => set("targets", e.target.value || null)}
                />
              </Field>
            </div>

            <Field label="Oportunidades — portas que essa GIG pode abrir">
              <Textarea
                rows={3}
                value={state.opportunities ?? ""}
                onChange={(e) => set("opportunities", e.target.value || null)}
              />
            </Field>
          </TabsContent>

          {/* ============ LOGÍSTICA / FINANCEIRO ============ */}
          <TabsContent value="logistics" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Como vou chegar (transporte)">
                <Input
                  value={state.transport ?? ""}
                  onChange={(e) => set("transport", e.target.value || null)}
                />
              </Field>
              <Field label="Hora de saída de casa">
                <Input
                  type="time"
                  value={state.departure_time ?? ""}
                  onChange={(e) =>
                    set("departure_time", e.target.value || null)
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Equipamento fornecido pelo local">
                <Textarea
                  rows={3}
                  value={state.equipment_provided ?? ""}
                  onChange={(e) =>
                    set("equipment_provided", e.target.value || null)
                  }
                />
              </Field>
              <Field label="Equipamento que preciso levar">
                <Textarea
                  rows={3}
                  value={state.equipment_to_bring ?? ""}
                  onChange={(e) =>
                    set("equipment_to_bring", e.target.value || null)
                  }
                />
              </Field>
            </div>

            <Field label="Despesas relacionadas (transporte, hospedagem, etc.)">
              <Textarea
                rows={2}
                value={state.related_expenses ?? ""}
                onChange={(e) =>
                  set("related_expenses", e.target.value || null)
                }
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Forma de pagamento">
                <Input
                  placeholder="PIX, transferência, etc."
                  value={state.payment_method ?? ""}
                  onChange={(e) =>
                    set("payment_method", e.target.value || null)
                  }
                />
              </Field>
              <Field label="Status do pagamento">
                <Select
                  value={state.payment_status ?? "Pendente"}
                  onValueChange={(v) =>
                    set("payment_status", v as Gig["payment_status"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Previsão de recebimento">
                <Input
                  type="date"
                  value={state.payment_due_date ?? ""}
                  onChange={(e) =>
                    set("payment_due_date", e.target.value || null)
                  }
                />
              </Field>
            </div>

            <Field label="Observações gerais (dress code, estacionamento, etc.)">
              <Textarea
                rows={3}
                value={state.general_notes ?? ""}
                onChange={(e) => set("general_notes", e.target.value || null)}
              />
            </Field>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {gig ? "Salvar alterações" : "Criar GIG"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
