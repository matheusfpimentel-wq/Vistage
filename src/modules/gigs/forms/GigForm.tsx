import { useEffect, useState } from "react";
import { Loader2, Plus, Search, Target, Trash2, X } from "lucide-react";
import { getDb } from "@/lib/db";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { AttachmentField } from "@/components/shared/AttachmentField";
import {
  GIG_STATUSES,
  PAYMENT_STATUSES,
  type Gig,
  type GigCreateInput,
} from "../types";
import { createGig, createGigPrepTask, getGig, listGigTracks, setGigTracks, updateGig } from "../api";
import { syncGigPaymentTransaction, listEquipment, createEquipment } from "@/modules/finance/api";
import type { Equipment } from "@/modules/finance/types";
import { PAYMENT_METHODS } from "@/modules/finance/types";
import { loadAuth, pushGigToCalendar } from "@/lib/gcal";
import { createTask } from "@/modules/tasks/api";
import { todayISO } from "@/lib/format";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { listVenues } from "@/modules/venues/api";
import { listContentPromoting } from "@/modules/content/api";
import { listTracks } from "@/modules/music/api";
import { QuickVenueForm } from "@/modules/venues/forms/QuickVenueForm";
import { QuickContactForm } from "@/modules/crm/forms/QuickContactForm";
import type { Venue } from "@/modules/venues/types";
import { useUnsavedConfirm } from "@/lib/dirty";
import { cn } from "@/lib/utils";
import { PrepChecklist } from "../components/PrepChecklist";
import { parsePrepState } from "../prep";
import { GigSetlist } from "./GigSetlist";
import { RecurringFestField } from "./RecurringFestField";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gig?: Gig | null;
  /** Pré-preenche o promoter_contact_id ao abrir em modo criar. */
  prefillPromoter?: Contact | null;
  onSaved: (gig: { id: number; statusChanged: boolean; isNew: boolean }) => void;
  /** Chamado quando o usuário clica em "Ir para Debrief" (só GIGs concluídas). */
  onDebrief?: () => void;
};

/** Categoria que habilita festa recorrente. */
export const FESTA_CATEGORY = "Festa";

/** True quando a categoria indica um evento social/privado (não-festa). */
function isSocialCategory(category: string | null | undefined): boolean {
  return !!category && category !== FESTA_CATEGORY;
}

type FormState = Omit<GigCreateInput, "id"> & {
  prep: Record<string, 1>;
  extra_flyers: string[]; // flyers além do primeiro (banner_file_path)
};

const EMPTY: FormState = {
  date: todayISO(),
  start_time: null,
  end_time: null,
  event_name: null,
  venue_name: "",
  venue_city: null,
  venue_address: null,
  venue_id: null,
  fans_present: null,
  promoter_contact_id: null,
  day_contact_name: null,
  day_contact_phone: null,
  estimated_audience: null,
  cache_amount: null,
  script_file_path: null,
  banner_file_path: null,
  extra_flyer_paths: null,
  extra_flyers: [],
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
  fans_notified: null,
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
  rating_contractor: null,
  is_special: 0,
  gcal_event_id: null,
  main_goal: null,
  prep_state: null,
  gig_equipment: "[]",
  gig_research: null,
  main_goal_task_id: null,
  event_category: null,
  recurring_event_name: null,
  cache_paid_pct: null,
  prep_task_id: null,
  prep: {},
};

function gigToState(gig: Gig): FormState {
  const { id: _id, created_at: _c, updated_at: _u, debrief_pending: _dp, debrief_completed_at: _dca, ...rest } = gig;
  let extra_flyers: string[] = [];
  try {
    const parsed = gig.extra_flyer_paths ? JSON.parse(gig.extra_flyer_paths) : [];
    if (Array.isArray(parsed)) extra_flyers = parsed.filter((p): p is string => typeof p === "string");
  } catch {
    extra_flyers = [];
  }
  return { ...rest, prep: parsePrepState(gig.prep_state), extra_flyers };
}

export function GigForm({
  open,
  onOpenChange,
  gig,
  prefillPromoter,
  onSaved,
  onDebrief,
}: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ date?: string; venue_name?: string }>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);
  const [quickVenueOpen, setQuickVenueOpen] = useState(false);
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [setListTrackIds, setSetListTrackIds] = useState<number[]>([]);
  const [allTracks, setAllTracks] = useState<{ id: number; title: string }[]>([]);
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [activeTab, setActiveTab] = useState("geral");
  const [promotingContent, setPromotingContent] = useState<
    { id: number; title: string; status: string }[]
  >([]);
  const [contactHistory, setContactHistory] = useState<{
    total: number;
    avg_rating: number | null;
    last_date: string | null;
    paid: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (gig) setState(gigToState(gig));
    else if (prefillPromoter)
      setState({
        ...EMPTY,
        promoter_contact_id: prefillPromoter.id,
        venue_city: prefillPromoter.city,
      });
    else setState(EMPTY);
    setErrors({});
    setDirty(false);
    setActiveTab("geral");
  }, [gig, prefillPromoter, open]);

  useEffect(() => {
    if (!open) return;
    void listContacts().then((cs) =>
      setContacts([...cs].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))
    );
    void listVenues().then((vs) => setVenues([...vs].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))));
    void listEquipment().then(setAllEquipment);
    void listTracks().then((ts) =>
      setAllTracks(
        ts.map((t) => ({
          id: t.id,
          title: t.title_final?.trim() || t.title_working,
        }))
      )
    );
    if (gig) {
      void listGigTracks(gig.id).then(setSetListTrackIds);
      void listContentPromoting("GIG", gig.id).then(setPromotingContent);
    } else {
      setSetListTrackIds([]);
      setPromotingContent([]);
    }
  }, [open, gig]);

  useEffect(() => {
    if (!state.promoter_contact_id) {
      setContactHistory(null);
      return;
    }
    const promoterId = state.promoter_contact_id;
    const gigId = gig?.id ?? 0;
    void (async () => {
      try {
        const db = getDb();
        const rows = await db.select<{
          total: number;
          avg_rating: number | null;
          last_date: string | null;
          paid: number;
        }[]>(
          `SELECT COUNT(*) as total, AVG(rating_contractor) as avg_rating, MAX(date) as last_date,
           SUM(CASE WHEN payment_status = 'Pago integralmente' THEN 1 ELSE 0 END) as paid
           FROM gigs WHERE promoter_contact_id = $1 AND id != $2`,
          [promoterId, gigId]
        );
        const row = rows[0];
        if (row && row.total > 0) {
          setContactHistory(row);
        } else {
          setContactHistory(null);
        }
      } catch {
        setContactHistory(null);
      }
    })();
  }, [state.promoter_contact_id, gig?.id]);

  function pickVenue(venueId: number | null) {
    if (venueId === null) {
      setState((s) => ({ ...s, venue_id: null }));
      return;
    }
    const v = venues.find((x) => x.id === venueId);
    if (!v) return;
    setState((s) => ({
      ...s,
      venue_id: v.id,
      venue_name: v.name,
      venue_city: v.city,
      venue_address: v.address,
    }));
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!state.date) e.date = "Obrigatório";
    if (!state.venue_name.trim()) e.venue_name = "Obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Limpa o erro do campo assim que o usuário preenche
  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit() {
    if (!validate()) {
      setActiveTab("geral"); // campos obrigatórios vivem na aba Geral
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const prevStatus = gig?.status;
      const prevMainGoalTaskId = gig?.main_goal_task_id ?? null;
      const isNew = !gig;

      const payload: GigCreateInput = {
        ...state,
        prep_state: JSON.stringify(state.prep),
        extra_flyer_paths: state.extra_flyers.length > 0 ? JSON.stringify(state.extra_flyers) : null,
      };
      // remove campos auxiliares que não existem no banco
      delete (payload as unknown as { prep?: unknown }).prep;
      delete (payload as unknown as { extra_flyers?: unknown }).extra_flyers;

      let savedId: number;
      if (gig) {
        await updateGig({ id: gig.id, ...payload });
        savedId = gig.id;
        toast.success("GIG atualizada");
      } else {
        savedId = await createGig(payload);
        toast.success("GIG criada");
        // Cria tarefa de preparação para a nova GIG — exceto GIGs retroativas
        // (data no passado), que não precisam de preparação.
        if (state.date >= todayISO()) {
          try {
            const newGig = await getGig(savedId);
            if (newGig) {
              const prepTaskId = await createGigPrepTask(newGig);
              await updateGig({ id: savedId, prep_task_id: prepTaskId });
            }
          } catch {
            /* não interrompe */
          }
        }
      }

      // objetivo principal vira tarefa (uma única vez por GIG)
      if (
        state.main_goal &&
        state.main_goal.trim().length > 0 &&
        !prevMainGoalTaskId
      ) {
        try {
          const taskId = await createTask({
            title: `Objetivo: ${state.main_goal.trim()}`,
            description: `Objetivo principal da GIG em ${state.venue_name}.`,
            category: "GIG",
            gig_id: savedId,
            contact_id: state.promoter_contact_id,
            priority: "Alta",
            status: "A fazer",
            due_date: state.date,
            tags: ["objetivo-gig"],
          });
          await updateGig({ id: savedId, main_goal_task_id: taskId });
        } catch {
          /* não interrompe se a tarefa falhar */
        }
      }

      // Cada "objetivo concreto" (uma linha) vira uma tarefa — só na criação,
      // pra não duplicar a cada edição.
      if (isNew && state.concrete_goals && state.concrete_goals.trim().length > 0) {
        const goals = state.concrete_goals
          .split("\n")
          .map((g) => g.trim())
          .filter((g) => g.length > 0);
        for (const goal of goals) {
          try {
            await createTask({
              title: `Objetivo: ${goal}`,
              description: `Objetivo concreto da GIG em ${state.venue_name}.`,
              category: "GIG",
              gig_id: savedId,
              contact_id: state.promoter_contact_id,
              priority: "Média",
              status: "A fazer",
              due_date: state.date,
              tags: ["objetivo-gig"],
            });
          } catch {
            /* não interrompe */
          }
        }
      }

      // Ao concluir a GIG, conclui também a tarefa de preparação
      if (state.status === "Concluída" && gig?.prep_task_id) {
        try {
          const { updateTask } = await import("@/modules/tasks/api");
          await updateTask({ id: gig.prep_task_id, status: "Concluída" });
        } catch {
          /* não interrompe */
        }
      }

      await setGigTracks(savedId, setListTrackIds);

      onSaved({
        id: savedId,
        statusChanged: !isNew && prevStatus !== state.status,
        isNew,
      });

      // Auto-vínculo financeiro para GIGs novas (update já é tratado em updateGig).
      // Para criar: sincroniza diretamente se há estado de pagamento relevante.
      if (isNew) {
        try {
          const cache =
            typeof state.cache_amount === "number" ? state.cache_amount : 0;
          const paid =
            state.payment_status === "Pago integralmente" ||
            state.payment_status === "Pago parcialmente";
          let pct: number;
          if (state.cache_paid_pct !== null && state.cache_paid_pct !== undefined) {
            pct = state.cache_paid_pct / 100;
          } else if (state.payment_status === "Pago integralmente") {
            pct = 1;
          } else {
            pct = 1;
          }
          const received = cache * pct;
          const baseName = state.recurring_event_name?.trim()
            ? state.event_name?.trim()
              ? `${state.recurring_event_name.trim()} - ${state.event_name.trim()}`
              : state.recurring_event_name.trim()
            : state.event_name?.trim() || state.venue_name || "GIG";
          const label = `Cachê: ${baseName}`;
          await syncGigPaymentTransaction(
            savedId,
            paid,
            received,
            state.payment_due_date ?? state.date,
            label,
            null,
            state.promoter_contact_id ?? null
          );
        } catch {
          /* não interrompe */
        }
      }

      try {
        const auth = await loadAuth();
        if (auth?.access_token && auth.calendar_id) {
          await pushGigToCalendar(savedId);
        } else if (auth?.access_token && !auth.calendar_id) {
          toast.warning("Google Calendar conectado mas sem calendário selecionado em Configurações.");
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
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{gig ? "Editar GIG" : "Nova GIG"}</DialogTitle>
            {gig && (gig.status === "Concluída" || gig.debrief_pending === 1 || gig.debrief_completed_at) && onDebrief && (
              <Button
                type="button"
                size="sm"
                variant={gig.debrief_pending === 1 ? "default" : "outline"}
                onClick={() => { onOpenChange(false); onDebrief(); }}
              >
                {gig.debrief_completed_at ? "Ver Debrief" : "Preencher Debrief"}
              </Button>
            )}
          </div>
          <DialogDescription>
            Debrief abre automaticamente ao mudar pra Concluída.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="briefing">Briefing</TabsTrigger>
            <TabsTrigger value="prep">Preparação</TabsTrigger>
            <TabsTrigger value="setlist">Setlist</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-4">
          {/* ============================ CAIXA 1: INFORMAÇÕES GERAIS ============================ */}
          <Section title="Informações gerais">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RecurringFestField
                enabled={state.event_category === FESTA_CATEGORY}
                recurringName={state.recurring_event_name ?? null}
                eventName={state.event_name ?? ""}
                onChangeRecurring={(v) => set("recurring_event_name", v)}
                onChangeEventName={(v) => set("event_name", v || null)}
              />
              <Field label="Categoria" hint="Tipo de evento para filtrar nas GIGs.">
                <Select
                  value={state.event_category ?? "none"}
                  onValueChange={(v) => {
                    const cat = v === "none" ? null : v;
                    set("event_category", cat);
                    // Se deixar de ser Festa, desliga o modo recorrente.
                    if (cat !== FESTA_CATEGORY && state.recurring_event_name !== null) {
                      set("recurring_event_name", null);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione uma categoria</SelectItem>
                    <SelectItem value="Evento Social">Evento Social</SelectItem>
                    <SelectItem value="Festa">Festa</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Data" required error={errors.date}>
                <Input
                  type="date"
                  value={state.date}
                  onChange={(e) => { set("date", e.target.value); clearError("date"); }}
                />
              </Field>
              <Field label="Início">
                <Input
                  type="time"
                  value={state.start_time ?? ""}
                  onChange={(e) => set("start_time", e.target.value || null)}
                />
              </Field>
              <Field label="Fim">
                <Input
                  type="time"
                  value={state.end_time ?? ""}
                  onChange={(e) => set("end_time", e.target.value || null)}
                />
              </Field>
            </div>

            <Field
              label="Venue"
              required
              error={errors.venue_name}
              hint="Selecione um venue cadastrado, crie um novo ou escolha 'Outro' para preencher manualmente sem salvar no módulo de Venues."
            >
              <div className="flex gap-2">
                <Select
                  value={
                    state.venue_id != null
                      ? state.venue_id.toString()
                      : state.venue_name && !state.venue_id
                      ? "_other"
                      : ""
                  }
                  onValueChange={(v) => {
                    if (v === "_other") {
                      setState((s) => ({ ...s, venue_id: null, venue_name: "", venue_city: null, venue_address: null }));
                    } else {
                      pickVenue(Number(v));
                      clearError("venue_name");
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um venue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_other">Outro (campo manual)</SelectItem>
                    {venues.map((v) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.name}
                        {v.city ? ` · ${v.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuickVenueOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Novo
                </Button>
              </div>
              {/* Campo manual quando "Outro" selecionado */}
              {state.venue_id == null && (
                <Input
                  className="mt-2"
                  placeholder="Nome do venue (não salvo no módulo de Venues)"
                  value={state.venue_name}
                  onChange={(e) => {
                    set("venue_name", e.target.value);
                    if (errors.venue_name) setErrors((er) => ({ ...er, venue_name: undefined }));
                  }}
                />
              )}
            </Field>

            <Field label="Cidade" hint="Cidade do venue. Preenchida automaticamente ao selecionar um venue.">
              <Input
                placeholder="Ex: São Paulo"
                value={state.venue_city ?? ""}
                onChange={(e) => set("venue_city", e.target.value || null)}
              />
            </Field>

            <Field label="Contratante">
              <div className="flex gap-2">
                <Select
                  value={state.promoter_contact_id?.toString() ?? "none"}
                  onValueChange={(v) =>
                    set("promoter_contact_id", v === "none" ? null : Number(v))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                        {c.city ? ` · ${c.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setQuickContactOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Novo
                </Button>
              </div>
              {contactHistory && (
                <div className="mt-2 bg-muted/50 rounded-md p-2 text-xs space-y-0.5 text-muted-foreground">
                  <div className="font-medium text-foreground">Histórico com este contratante</div>
                  <div>{contactHistory.total} GIG{contactHistory.total !== 1 ? "s" : ""} juntos</div>
                  {contactHistory.avg_rating != null && (
                    <div>Avaliação média: {contactHistory.avg_rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / 5</div>
                  )}
                  {contactHistory.last_date && (
                    <div>Última GIG: {contactHistory.last_date}</div>
                  )}
                  <div>Pagamentos: {contactHistory.paid} de {contactHistory.total} pagas integralmente</div>
                </div>
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Contato no dia"
                hint="Quem te recebe na chegada — produção, RP, etc."
              >
                <Input
                  value={state.day_contact_name ?? ""}
                  onChange={(e) => set("day_contact_name", e.target.value || null)}
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={state.day_contact_phone ?? ""}
                  onChange={(e) => set("day_contact_phone", e.target.value || null)}
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
                    set("cache_amount", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
              <Field
                label="Pagamento"
                hint="Marcar como Pago integralmente cria automaticamente a receita em DJ no Financeiro."
              >
                <Select
                  value={state.payment_status ?? "Pendente"}
                  onValueChange={(v) => {
                    const ps = v as Gig["payment_status"];
                    set("payment_status", ps);
                  }}
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
            </div>

            {state.payment_status !== "Pendente" &&
              state.payment_status !== "Pago integralmente" &&
              state.payment_status != null && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="% já recebido"
                  hint="Percentual do cachê que você já recebeu. Preenche automaticamente com base no status; ajuste se necessário."
                >
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={state.cache_paid_pct ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      set("cache_paid_pct", v !== null ? Math.min(100, Math.max(0, v)) : null);
                    }}
                  />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Forma de pagamento">
                <Select
                  value={state.payment_method ?? "none"}
                  onValueChange={(v) => set("payment_method", v === "none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definida</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Previsão de recebimento">
                <Input
                  type="date"
                  value={state.payment_due_date ?? ""}
                  onChange={(e) => set("payment_due_date", e.target.value || null)}
                />
              </Field>
            </div>
          </Section>

          {gig && promotingContent.length > 0 && (
            <Section title="Conteúdos promovendo esta GIG">
              <ul className="space-y-1 text-sm">
                {promotingContent.map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <span>{c.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          </TabsContent>

          <TabsContent value="briefing" className="space-y-4">
          {state.status === "Proposta" ? (
            <ProposalHint />
          ) : (
          <Section title="Briefing">
            <Field
              label="Objetivo principal"
              hint="O 'norte' dessa GIG em uma frase. Quando preenchido, vira uma Tarefa automaticamente."
              icon={<Target className="h-3.5 w-3.5 text-primary" />}
            >
              <Input
                placeholder='Ex: "Conquistar uma residência mensal aqui"'
                value={state.main_goal ?? ""}
                onChange={(e) => set("main_goal", e.target.value || null)}
              />
            </Field>

            <Field
              label="Contexto"
              hint="O que o contratante pediu e por quê. Ajuda quando você revisita a GIG dias depois."
            >
              <Textarea
                rows={3}
                value={state.briefing ?? ""}
                onChange={(e) => set("briefing", e.target.value || null)}
              />
            </Field>

            <Field
              label="Conceito do set"
              hint="Direção artística, vibe, narrativa. Ex: subida progressiva, melódico no início, peso no fim."
            >
              <Textarea
                rows={3}
                value={state.set_concept ?? ""}
                onChange={(e) => set("set_concept", e.target.value || null)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Objetivos concretos"
                hint="Métricas e marcas alcançáveis (uma por linha). Cada linha vira uma tarefa ao salvar."
              >
                <LineListField
                  value={state.concrete_goals}
                  onChange={(v) => set("concrete_goals", v)}
                  placeholder="Ex: tocar 4 unreleased"
                />
              </Field>
              <Field
                label="Alvos"
                hint="Pessoas, contatos, marcas que você quer atingir (um por linha)."
              >
                <LineListField
                  value={state.targets}
                  onChange={(v) => set("targets", v)}
                  placeholder="Ex: dono da casa"
                />
              </Field>
            </div>

            <Field
              label="Oportunidades"
              hint="Portas que essa GIG pode abrir no curto-médio prazo."
            >
              <Textarea
                rows={3}
                placeholder="Ex: Mandar release, manter o contato, produzir música, divulgar vídeo"
                value={state.opportunities ?? ""}
                onChange={(e) => set("opportunities", e.target.value || null)}
              />
            </Field>
          </Section>
          )}
          </TabsContent>

          <TabsContent value="prep" className="space-y-4">
          {state.status === "Proposta" ? (
            <ProposalHint />
          ) : (
          <Section
            title="Preparação"
            description="Marque o que já está pronto. O progresso aparece no Dashboard."
          >
            <PrepChecklist
              state={state.prep}
              groupFilter={isSocialCategory(state.event_category) ? ["musical", "logistica"] : undefined}
              onChange={(prep) => { setState((s) => ({ ...s, prep })); setDirty(true); }}
            />

            <Field
              label="Equipamento da casa"
              hint="O que estará disponível no venue (CDJs, mixer, monitores…)."
            >
              <Textarea
                rows={2}
                value={state.equipment_provided ?? ""}
                onChange={(e) => set("equipment_provided", e.target.value || null)}
              />
            </Field>

            <EquipmentToCarry
              allEquipment={allEquipment}
              gigEquipment={state.gig_equipment}
              onEquipmentChange={(v) => set("gig_equipment", v)}
              onEquipmentAdded={async (name) => {
                const id = await createEquipment({ name, category: null, purchase_value: null, notes: null, transaction_id: null, purchase_date: null, state: "Em uso", location: null, quantity: 1, photo_path: null });
                const fresh = await listEquipment();
                setAllEquipment(fresh);
                // auto-seleciona o novo item
                try {
                  const parsed = JSON.parse(state.gig_equipment) as unknown;
                  const ids = Array.isArray(parsed) ? (parsed as number[]) : [];
                  set("gig_equipment", JSON.stringify([...ids, id]));
                } catch {
                  set("gig_equipment", JSON.stringify([id]));
                }
              }}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Observações">
                <Textarea
                  rows={2}
                  placeholder="Dress code, estacionamento, etc."
                  value={state.general_notes ?? ""}
                  onChange={(e) => set("general_notes", e.target.value || null)}
                />
              </Field>
              {!isSocialCategory(state.event_category) && (
                <Field label="Fãs comunicados (marketing)">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={state.fans_notified?.toString() ?? ""}
                    onChange={(e) => set("fans_notified", e.target.value ? Number(e.target.value) : null)}
                  />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AttachmentField
                label="Flyer / arte (principal — vai pra Identidade)"
                value={state.banner_file_path}
                onChange={(v) => set("banner_file_path", v)}
                subdir="gigs/flyers"
                variant="image"
              />
              <AttachmentField
                label="Roteiro / setlist"
                value={state.script_file_path}
                onChange={(v) => set("script_file_path", v)}
                subdir="gigs/scripts"
                variant="document"
              />
            </div>

            {/* Flyers adicionais — só o principal acima vai pra Identidade */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Flyers adicionais</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set("extra_flyers", [...state.extra_flyers, ""])}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar flyer
                </Button>
              </div>
              {state.extra_flyers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Adicione mais de uma arte se a GIG tiver variações de flyer.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {state.extra_flyers.map((path, i) => (
                    <div key={i} className="space-y-1">
                      <AttachmentField
                        label={`Flyer adicional ${i + 1}`}
                        value={path || null}
                        onChange={(v) =>
                          set(
                            "extra_flyers",
                            state.extra_flyers.map((p, j) => (j === i ? v ?? "" : p))
                          )
                        }
                        subdir="gigs/flyers"
                        variant="image"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive"
                        onClick={() =>
                          set(
                            "extra_flyers",
                            state.extra_flyers.filter((_, j) => j !== i)
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
          )}
          </TabsContent>

          <TabsContent value="setlist" className="space-y-4">
            {state.status === "Proposta" ? (
              <ProposalHint />
            ) : (
              <>
                <Section title="Pesquisa musical">
                  <p className="text-xs text-muted-foreground">Músicas que descobriu ou pensou em tocar nessa GIG.</p>
                  <ResearchList
                    value={state.gig_research}
                    onChange={(v) => set("gig_research", v)}
                  />
                </Section>

                {allTracks.length > 0 && (
                  <Section title="Minhas Tracks">
                    <p className="text-xs text-muted-foreground">Marque as tracks da sua biblioteca que tocou nessa GIG.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allTracks.map((t) => {
                        const selected = setListTrackIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setSetListTrackIds((ids) =>
                                selected
                                  ? ids.filter((x) => x !== t.id)
                                  : [...ids, t.id]
                              )
                            }
                            className={cn(
                              "rounded-md border px-2.5 py-1 text-xs transition",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {t.title}
                          </button>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {gig ? (
                  <Section title="Setlist de arquivo">
                    <p className="text-xs text-muted-foreground">Importe o setlist exportado do Rekordbox, Traktor ou Serato.</p>
                    <GigSetlist gigId={gig.id} />
                  </Section>
                ) : (
                  <Section title="Setlist de arquivo">
                    <p className="text-xs text-muted-foreground">Salve a GIG primeiro para poder importar um setlist de arquivo.</p>
                  </Section>
                )}
              </>
            )}
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

      <QuickVenueForm
        open={quickVenueOpen}
        onOpenChange={setQuickVenueOpen}
        onCreated={async (id) => {
          const fresh = await listVenues();
          setVenues(fresh);
          pickVenue(id);
        }}
      />

      <QuickContactForm
        open={quickContactOpen}
        onOpenChange={setQuickContactOpen}
        defaultType="Contratante"
        onCreated={async (id) => {
          const fresh = await listContacts();
          setContacts([...fresh].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
          set("promoter_contact_id", id);
        }}
      />
    </Dialog>
  );
}

type ResearchItem = { title: string; artist: string; note: string };

function ResearchList({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const items: ResearchItem[] = (() => {
    try {
      const parsed = value ? (JSON.parse(value) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as ResearchItem[]) : [];
    } catch {
      return [];
    }
  })();

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");

  function save(next: ResearchItem[]) {
    onChange(next.length > 0 ? JSON.stringify(next) : null);
  }

  function add() {
    if (!title.trim() && !artist.trim()) return;
    save([...items, { title: title.trim(), artist: artist.trim(), note: "" }]);
    setTitle("");
    setArtist("");
  }

  function remove(i: number) {
    save(items.filter((_, j) => j !== i));
  }

  function updateNote(i: number, note: string) {
    save(items.map((item, j) => (j === i ? { ...item, note } : item)));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="flex-1"
        />
        <Input
          placeholder="Artista"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma música pesquisada ainda. Adicione acima.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border px-2.5 py-2">
              <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm font-medium leading-none">
                  {item.title || "—"}
                  {item.artist && <span className="ml-1.5 text-xs text-muted-foreground">· {item.artist}</span>}
                </div>
                <Input
                  placeholder="Nota (opcional)"
                  value={item.note}
                  onChange={(e) => updateNote(i, e.target.value)}
                  className="h-6 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lista editável linha-a-linha. Persiste como texto com linhas separadas por \n. */
function LineListField({
  value,
  onChange,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const lines = (value ?? "").split("\n").filter((l) => l.trim().length > 0);
  const rows = lines.length > 0 ? lines : [""];

  function commit(next: string[]) {
    const cleaned = next.map((l) => l.trim()).filter((l) => l.length > 0);
    onChange(cleaned.length > 0 ? cleaned.join("\n") : null);
  }

  return (
    <div className="space-y-1.5">
      {rows.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={line}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...rows];
              next[i] = e.target.value;
              commit(next);
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => commit(rows.filter((_, idx) => idx !== i))}
            aria-label="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-xs"
        onClick={() => commit([...rows, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar
      </Button>
    </div>
  );
}

function EquipmentToCarry({
  allEquipment,
  gigEquipment,
  onEquipmentChange,
  onEquipmentAdded,
}: {
  allEquipment: Equipment[];
  gigEquipment: string;
  onEquipmentChange: (v: string) => void;
  onEquipmentAdded: (name: string) => Promise<void>;
}) {
  const [quickName, setQuickName] = useState("");
  const [adding, setAdding] = useState(false);

  const selectedIds: number[] = (() => {
    try {
      const parsed = JSON.parse(gigEquipment) as unknown;
      return Array.isArray(parsed) ? (parsed as number[]) : [];
    } catch {
      return [];
    }
  })();

  async function handleQuickAdd() {
    if (!quickName.trim()) return;
    setAdding(true);
    try {
      await onEquipmentAdded(quickName.trim());
      setQuickName("");
    } finally {
      setAdding(false);
    }
  }

  const categories = Array.from(new Set(allEquipment.map((e) => e.category ?? "Sem categoria")));

  return (
    <div className="space-y-3">
      <Label className="text-sm">O que preciso levar</Label>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Patrimônio cadastrado — marque o que vai usar nessa GIG:</p>
        {categories.map((cat) => {
          const items = allEquipment.filter((e) => (e.category ?? "Sem categoria") === cat);
          return (
            <div key={cat} className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat}</div>
              <div className="flex flex-wrap gap-2">
                {items.map((eq) => {
                  const checked = selectedIds.includes(eq.id);
                  return (
                    <label key={eq.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedIds.filter((x) => x !== eq.id)
                            : [...selectedIds, eq.id];
                          onEquipmentChange(JSON.stringify(next));
                        }}
                        className="h-3.5 w-3.5"
                      />
                      {eq.name}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Adicionar patrimônio rapidamente…"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleQuickAdd(); } }}
            className="flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleQuickAdd()}
            disabled={adding || !quickName.trim()}
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProposalHint() {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      Briefing, Setlist e Preparação ficam disponíveis assim que o status virar
      <strong className="mx-1">Confirmada</strong>.
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-gradient">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="inline-flex items-center gap-1.5">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && <InfoHint>{hint}</InfoHint>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
