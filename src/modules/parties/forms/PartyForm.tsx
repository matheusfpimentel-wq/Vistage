import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/tooltip";
import { EMPTY_VALUE, formatCurrency, toLocalISODate } from "@/lib/format";
import { onEnterSave } from "@/lib/formEnter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
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
import { cn } from "@/lib/utils";
import { useUnsavedConfirm } from "@/lib/dirty";
import { listContacts } from "@/modules/crm/api";
import { QuickContactForm } from "@/modules/crm/forms/QuickContactForm";
import type { Contact } from "@/modules/crm/types";
import { listServices, listSuppliers } from "@/modules/suppliers/api";
import type { Supplier, SupplierService } from "@/modules/suppliers/types";
import { listVenues } from "@/modules/venues/api";
import type { Venue } from "@/modules/venues/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { QuickVenueForm } from "@/modules/venues/forms/QuickVenueForm";
import { loadAuth, pushPartyToCalendar } from "@/lib/gcal";
import {
  PARTY_STATUSES,
  confirmStatusLabel,
  type ConfirmStatus,
  type PartyDeserialized,
  type PartyStatus,
  type PartyTeamMember,
  type PartySponsor,
  type LineupStatus,
  type PartyStage,
  type PartyBudgetItem,
  type PartyTicket,
  type PartyTask,
  type PartyGuest,
} from "../types";
import {
  createParty,
  updateParty,
  autoGeneratePartyTasks,
  listPartyVenueCandidates,
  addPartyVenueCandidate,
  removePartyVenueCandidate,
  initDefaultStages,
  listPartyStages,
  listPartyBudgetItems,
  listPartyTickets,
  listPartyTasks,
  listPartyGuests,
  syncTeamBudgetItems,
  addPartyGuestsToFans,
} from "../api";
import { WorkflowTab } from "../components/WorkflowTab";
import { OrcamentoTab } from "../components/OrcamentoTab";
import { IngressosTab } from "../components/IngressosTab";
import { OperacaoTab } from "../components/OperacaoTab";
import { PartyCockpit } from "../components/PartyCockpit";
import { SeriesEditionCard } from "../components/SeriesEditionCard";
import { BriefingDialog } from "../components/BriefingDialog";

/**
 * Status sugerido por marcos (sugere, NÃO avança sozinho): a data já passou →
 * Realizada; já vendeu ingresso → Em vendas; venue escolhido → Confirmada. Do
 * mais avançado pro menos. Só sugere enquanto o usuário não fixou manualmente.
 */
function suggestStatus(
  status: PartyStatus,
  date: string | null,
  venueId: number | null,
  sold: number
): PartyStatus | null {
  const today = toLocalISODate();
  if (status === "Cancelada") return null;
  if (date && date < today && status !== "Realizada") return "Realizada";
  if (sold > 0 && status !== "Em vendas" && status !== "Realizada") return "Em vendas";
  if (venueId != null && (status === "Ideia" || status === "Planejando")) return "Confirmada";
  return null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party?: PartyDeserialized | null;
  onSaved: () => void;
};

/** Próximo estado do ciclo de confirmação (pendente ↔ confirmado). */
function cycleConfirm(s: ConfirmStatus | null | undefined): ConfirmStatus {
  return s === "confirmado" ? "pendente" : "confirmado";
}

/** Chip de um clique pra confirmar equipe/patrocínio na própria linha (fonte única). */
function ConfirmChip({
  status,
  onCycle,
}: {
  status: ConfirmStatus | null | undefined;
  onCycle: () => void;
}) {
  const confirmed = status === "confirmado";
  return (
    <button
      type="button"
      onClick={onCycle}
      title="Confirmar / marcar pendente"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
        confirmed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      )}
    >
      {confirmed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {confirmStatusLabel(status)}
    </button>
  );
}

type FormState = {
  title: string;
  date: string | null;
  venue_id: number | null;
  venue_name: string | null;
  status: PartyStatus;
  status_override: number;
  description: string | null;
  expected_capacity: number | null;
  actual_attendance: number | null;
  bar_revenue: number | null;
  target_cac: number | null;
  lineup: number[];
  sponsors: PartySponsor[];
  team: PartyTeamMember[];
  /** Confirmação do lineup por DJ (contact_id → status/prazo). */
  lineup_status: LineupStatus;
  notes: string | null;
  gig_id: number | null;
};

const EMPTY: FormState = {
  title: "",
  date: null,
  venue_id: null,
  venue_name: null,
  status: "Planejando",
  status_override: 0,
  description: null,
  expected_capacity: null,
  actual_attendance: null,
  bar_revenue: null,
  target_cac: null,
  lineup: [],
  sponsors: [],
  team: [],
  lineup_status: {},
  notes: null,
  gig_id: null,
};

const LINEUP_TYPES = ["DJ parceiro", "Músico"];
// Papéis comuns de produção de festa — sugestões de 1 toque no campo Função (§2.7).
const PRODUCTION_ROLES = [
  "Segurança",
  "Bar",
  "Portaria/Lista",
  "Foto/Vídeo",
  "Luz e som",
  "Staff de montagem",
  "Limpeza",
];

// Candidato local (festa nova, ainda sem id): só venue_id + nome para exibir.
type LocalCandidate = { venue_id: number; venue_name: string };

export function PartyForm({ open, onOpenChange, party, onSaved }: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Venues
  const [venues, setVenues] = useState<Venue[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [quickVenueOpen, setQuickVenueOpen] = useState(false);
  const [candidates, setCandidates] = useState<LocalCandidate[]>([]);

  // Sub-tab data (edit only)
  const [stages, setStages] = useState<PartyStage[]>([]);
  const [budgetItems, setBudgetItems] = useState<PartyBudgetItem[]>([]);
  const [tickets, setTickets] = useState<PartyTicket[]>([]);
  const [guests, setGuests] = useState<PartyGuest[]>([]);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [tasks, setTasks] = useState<PartyTask[]>([]);

  // Team add-form state
  const [teamSupplierId, setTeamSupplierId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamRole, setTeamRole] = useState("");
  const [teamAmount, setTeamAmount] = useState("");
  // Serviços do fornecedor selecionado — escolher um preenche função + valor.
  const [teamServices, setTeamServices] = useState<SupplierService[]>([]);

  const [sponsorName, setSponsorName] = useState("");
  const [sponsorAmount, setSponsorAmount] = useState("");
  const [sponsorTerms, setSponsorTerms] = useState("");
  // Sub-aba da Equipe (§2.7): Line-up | Produção | Patrocinadores.
  const [equipeSub, setEquipeSub] = useState<"lineup" | "producao" | "patrocinadores">("lineup");

  const confirmClose = useUnsavedConfirm(dirty);
  const navigate = useNavigate();
  // Abre o cadastro do venue (link na Viabilidade §2.2); se há alteração não
  // salva no buffer, avisa antes de sair — trata como um fechar do diálogo.
  function openVenue(venueId: number) {
    confirmClose(false, () => {
      onOpenChange(false);
      navigate(`/venues?open=${venueId}`);
    });
  }
  const isEdit = !!party;
  // Aba ativa controlada: mantemos TODAS as abas montadas (forceMount + hidden)
  // pra não perder o que foi preenchido ao trocar de aba — Radix por padrão
  // desmonta a aba inativa e o estado em digitação some.
  const [tab, setTab] = useState("info");

  const loadCandidates = useCallback(async () => {
    if (!party) return;
    const rows = await listPartyVenueCandidates(party.id);
    setCandidates(rows.map((r) => ({ venue_id: r.venue_id, venue_name: r.venue_name ?? "" })));
  }, [party]);

  const loadSubTabs = useCallback(async () => {
    if (!party) return;
    await initDefaultStages(party.id);
    const [s, b, t, tk, g] = await Promise.all([
      listPartyStages(party.id),
      listPartyBudgetItems(party.id),
      listPartyTickets(party.id),
      listPartyTasks(party.id),
      listPartyGuests(party.id),
    ]);
    setStages(s);
    setBudgetItems(b);
    setTickets(t);
    setTasks(tk);
    setGuests(g);
  }, [party]);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setSponsorName("");
    setSponsorAmount("");

    void listContacts().then((all) =>
      setContacts(
        all.filter((c) => c.types.some((t) => LINEUP_TYPES.includes(t)))
      )
    );
    void listSuppliers().then(setSuppliers);
    void listVenues().then(setVenues);
    void listGigs().then(setGigs);

    if (party) {
      setState({
        title: party.title,
        date: party.date,
        venue_id: party.venue_id,
        venue_name: party.venue_name,
        status: party.status,
        status_override: party.status_override,
        description: party.description,
        expected_capacity: party.expected_capacity,
        actual_attendance: party.actual_attendance,
        bar_revenue: party.bar_revenue,
        target_cac: party.target_cac,
        lineup: party.lineup,
        sponsors: party.sponsors,
        team: party.team,
        lineup_status: party.lineup_status ?? {},
        notes: party.notes,
        gig_id: party.gig_id,
      });
      void loadCandidates();
      void loadSubTabs();
    } else {
      setState(EMPTY);
      setCandidates([]);
      setStages([]);
      setBudgetItems([]);
      setTickets([]);
      setTasks([]);
      setGuests([]);
    }
  }, [open, party, loadCandidates, loadSubTabs]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  // Patch ao vivo de campos da festa a partir de sub-abas (ex.: Viabilidade
  // confirma o venue / edita a capacidade). Atualiza o buffer do form E persiste
  // na hora — mantém cockpit/orçamento em sincronia sem depender do Salvar.
  const patchPartyLive = useCallback(
    async (
      updates: Partial<
        Pick<FormState, "venue_id" | "venue_name" | "expected_capacity" | "actual_attendance">
      >
    ) => {
      setState((s) => ({ ...s, ...updates }));
      if (!party) return;
      try {
        await updateParty({ id: party.id, ...updates });
      } catch (e) {
        toast.error(`Não consegui salvar: ${String(e)}`);
      }
    },
    [party]
  );

  // Espelho síncrono do state: as confirmações da Equipe (team/sponsors/lineup)
  // são alternadas por linha e podem disparar dois cliques antes do re-render.
  // Para não perder um deles, os patches recebem um MAPPER e o aplicam sobre o
  // valor mais fresco (stateRef, avançado na hora), não sobre um prop defasado.
  const stateRef = useRef(state);
  stateRef.current = state;

  function persistParty<K extends "team" | "sponsors" | "lineup_status">(key: K, next: FormState[K]) {
    stateRef.current = { ...stateRef.current, [key]: next };
    setState((s) => ({ ...s, [key]: next }));
    if (party) void updateParty({ id: party.id, [key]: next }).catch((e) => toast.error(`Não consegui salvar: ${String(e)}`));
  }
  const patchTeamLive = useCallback(
    (mapper: (prev: PartyTeamMember[]) => PartyTeamMember[]) => persistParty("team", mapper(stateRef.current.team)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party]
  );
  const patchSponsorsLive = useCallback(
    (mapper: (prev: PartySponsor[]) => PartySponsor[]) => persistParty("sponsors", mapper(stateRef.current.sponsors)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party]
  );
  const patchLineupStatusLive = useCallback(
    (mapper: (prev: LineupStatus) => LineupStatus) => persistParty("lineup_status", mapper(stateRef.current.lineup_status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party]
  );

  const isConfirmedStatus = state.status === "Confirmada" || state.status === "Realizada";
  // Público real é COMPUTADO (de-dup 3b): total de ingressos vendidos. A festa
  // pode sobrepor com uma contagem manual de portaria (actual_attendance).
  const ticketsSold = tickets.reduce((s, t) => s + (t.quantity_sold ?? 0), 0);

  function toggleLineup(id: number) {
    set(
      "lineup",
      state.lineup.includes(id)
        ? state.lineup.filter((x) => x !== id)
        : [...state.lineup, id]
    );
  }

  // Ordem do line-up = escalação (a Operação lê esta ordem para os sets, §2.7).
  function moveLineup(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= state.lineup.length) return;
    const next = [...state.lineup];
    [next[idx], next[j]] = [next[j], next[idx]];
    set("lineup", next);
  }

  async function addCandidate(venueId: number, venueList: Venue[] = venues) {
    const v = venueList.find((x) => x.id === venueId);
    if (!v) return;
    if (candidates.some((c) => c.venue_id === venueId)) return;
    if (party) {
      try {
        await addPartyVenueCandidate(party.id, venueId);
        await loadCandidates();
      } catch (e) {
        toast.error(`Erro: ${String(e)}`);
        return;
      }
    } else {
      setCandidates((prev) => [...prev, { venue_id: venueId, venue_name: v.name }]);
    }
    setDirty(true);
  }

  async function removeCandidate(venueId: number) {
    if (party) {
      try {
        await removePartyVenueCandidate(party.id, venueId);
        await loadCandidates();
      } catch (e) {
        toast.error(`Erro: ${String(e)}`);
        return;
      }
    } else {
      setCandidates((prev) => prev.filter((c) => c.venue_id !== venueId));
    }
    setDirty(true);
  }

  function addSponsor() {
    const name = sponsorName.trim();
    const cents = Math.round(parseFloat(sponsorAmount) * 100);
    if (!name || isNaN(cents) || cents <= 0) {
      toast.error("Preencha nome e valor do patrocinador");
      return;
    }
    set("sponsors", [...state.sponsors, { name, amount_cents: cents, terms: sponsorTerms.trim() || null }]);
    setSponsorName("");
    setSponsorAmount("");
    setSponsorTerms("");
  }

  function removeSponsor(idx: number) {
    set(
      "sponsors",
      state.sponsors.filter((_, i) => i !== idx)
    );
  }

  function addTeamMember() {
    const name = teamSupplierId
      ? (suppliers.find((s) => s.id === teamSupplierId)?.name ?? teamName.trim())
      : teamName.trim();
    const role = teamRole.trim();
    const cents = Math.round(parseFloat(teamAmount) * 100);
    if (!name || !role) {
      toast.error("Preencha nome e função do membro");
      return;
    }
    const member: PartyTeamMember = {
      name,
      role,
      amount_cents: isNaN(cents) || cents < 0 ? 0 : cents,
      supplier_id: teamSupplierId,
    };
    set("team", [...state.team, member]);
    setTeamSupplierId(null);
    setTeamServices([]);
    setTeamName("");
    setTeamRole("");
    setTeamAmount("");
  }

  function removeTeamMember(idx: number) {
    set("team", state.team.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!state.title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }

    // Confirmada/Realizada exige exatamente um venue.
    let venueId = state.venue_id;
    let venueName = state.venue_name;
    if (isConfirmedStatus) {
      // Respeita a escolha explícita do usuário no Select. Só usa o
      // candidato único automaticamente quando nada foi escolhido.
      if (venueId == null && candidates.length === 1) {
        venueId = candidates[0].venue_id;
        venueName = candidates[0].venue_name;
      } else if (venueId == null) {
        if (candidates.length === 0) {
          toast.error("Status confirmado exige escolher um venue");
        } else {
          toast.error("Mais de um candidato. Escolha um venue único");
        }
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        title: state.title,
        date: state.date,
        venue_id: venueId,
        venue_name: venueName,
        status: state.status,
        status_override: state.status_override,
        description: state.description,
        expected_capacity: state.expected_capacity,
        actual_attendance: state.actual_attendance,
        bar_revenue: state.bar_revenue,
        target_cac: state.target_cac,
        ticket_price_regular: null,
        ticket_price_vip: null,
        lineup: state.lineup,
        sponsors: state.sponsors,
        team: state.team,
        lineup_status: state.lineup_status,
        notes: state.notes,
        gig_id: state.gig_id,
      };

      let savedPartyId: number;
      if (party) {
        savedPartyId = party.id;
        await updateParty({ id: party.id, ...payload });
        if (
          state.status === "Confirmada" &&
          party.tasks_generated === 0 &&
          party.status !== "Confirmada"
        ) {
          const fresh = { ...party, ...payload, tasks_generated: 0 };
          await autoGeneratePartyTasks(fresh);
          toast.success("4 tarefas criadas");
        }
        toast.success("Festa atualizada");
      } else {
        const id = await createParty(payload);
        savedPartyId = id;
        // Persiste candidatos locais agora que temos o id.
        for (const c of candidates) {
          await addPartyVenueCandidate(id, c.venue_id);
        }
        if (state.status === "Confirmada") {
          const fresh: PartyDeserialized = {
            id,
            ...payload,
            team: state.team,
            stage_current: null,
            financial_synced: 0,
            tasks_generated: 0,
            series_id: null,
            edition_label: null,
            edition_number: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await autoGeneratePartyTasks(fresh);
          toast.success("4 tarefas criadas");
        }
        toast.success("Festa criada");
      }
      // Gera itens de orçamento para novos membros da equipe de produção.
      try {
        const createdFor = await syncTeamBudgetItems(savedPartyId, state.team);
        if (createdFor.length === 1) {
          toast.success(`Item de orçamento criado para ${createdFor[0]}`);
        } else if (createdFor.length > 1) {
          toast.success(`${createdFor.length} itens de orçamento criados para a equipe`);
        }
      } catch {
        // falha ao sincronizar orçamento não bloqueia o save
      }
      // Sync com Google Calendar
      try {
        const auth = await loadAuth();
        if (auth?.access_token && auth.calendar_id && state.date) {
          const savedPartyId = party ? party.id : null;
          const gcalEventId = party?.gcal_event_id ?? null;
          const eventId = await pushPartyToCalendar({
            id: savedPartyId ?? 0,
            title: state.title,
            date: state.date,
            venue_name: state.venue_name ?? null,
            gcal_event_id: gcalEventId,
          });
          if (!gcalEventId && savedPartyId) {
            await updateParty({ id: savedPartyId, gcal_event_id: eventId });
          }
        }
      } catch {
        // falha no calendário não bloqueia o save
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const candidateVenueIds = new Set(candidates.map((c) => c.venue_id));
  const availableVenues = venues.filter((v) => !candidateVenueIds.has(v.id));

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-5xl" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>{party ? "Editar festa" : "Nova festa"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="info">Info</TabsTrigger>
            {isEdit && <TabsTrigger value="workflow">Workflow</TabsTrigger>}
            <TabsTrigger value="lineup">Equipe</TabsTrigger>
            {isEdit && <TabsTrigger value="orcamento">Financeiro</TabsTrigger>}
            {isEdit && <TabsTrigger value="ingressos">Ingressos</TabsTrigger>}
            {isEdit && <TabsTrigger value="operacao">Operação</TabsTrigger>}
          </TabsList>

          {/* ===== INFO ===== */}
          <TabsContent value="info" forceMount hidden={tab !== "info"} className="space-y-4 pt-2">
            <Field label="Título *">
              <Input
                value={state.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder='Ex: "Party Night Vol. 3"'
              />
            </Field>

            {isEdit && party && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  Série / Edição
                </summary>
                <div className="pt-2">
                  <SeriesEditionCard
                    partyId={party.id}
                    seriesId={party.series_id}
                    editionLabel={party.edition_label}
                    editionNumber={party.edition_number}
                    partyTitle={state.title}
                  />
                </div>
              </details>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data">
                <Input
                  type="date"
                  value={state.date ?? ""}
                  onChange={(e) => set("date", e.target.value || null)}
                />
              </Field>
              <Field label="Status">
                <Select
                  value={state.status}
                  onValueChange={(v) => {
                    // Escolha manual fixa o status: a auto-sugestão para de cobrar.
                    setState((s) => ({ ...s, status: v as PartyStatus, status_override: 1 }));
                    setDirty(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {(() => {
              // Só sugere enquanto o usuário não fixou o status manualmente.
              if (state.status_override) return null;
              const suggested = suggestStatus(state.status, state.date, state.venue_id, ticketsSold);
              if (!suggested) return null;
              const reason =
                suggested === "Realizada" ? "a data já passou"
                : suggested === "Em vendas" ? "os ingressos já estão vendendo"
                : "o venue já está escolhido";
              return (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
                  <span className="flex-1">
                    Sugestão: marcar como <strong>{suggested}</strong> ({reason}).
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => set("status", suggested)}
                  >
                    Aplicar
                  </Button>
                </div>
              );
            })()}

            <div className="grid items-start gap-3 sm:grid-cols-2">
            <Field label="GIG vinculada" hint="Não precisa preencher se você toca na própria festa.">
              <Select
                value={state.gig_id != null ? String(state.gig_id) : "none"}
                onValueChange={(v) =>
                  set("gig_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {gigs.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {(g.event_name || g.venue_name || "GIG")}
                      {g.date ? ` · ${g.date}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* ===== VENUES ===== */}
            {/* Em festas já criadas, a escolha da casa vive na Viabilidade — a
                Info vira vitrine read-only (venue confirmado + capacidade). */}
            {isEdit ? (
              <div className="space-y-2">
                <Label>Venue</Label>
                {/* Read-only: só o nome (a casa é escolhida na Viabilidade §2.1). */}
                <div className="flex h-10 items-center justify-between gap-2 rounded-md border bg-muted/30 px-3">
                  <span className="min-w-0 truncate text-sm">
                    {state.venue_name ? (
                      <span className="font-medium">{state.venue_name}</span>
                    ) : (
                      <span className="text-muted-foreground">Não confirmado</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTab("workflow")}
                    className="shrink-0 text-xs text-primary hover:underline"
                  >
                    alterar na Viabilidade →
                  </button>
                </div>
              </div>
            ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {isConfirmedStatus ? "Venue (escolha um)" : "Venues candidatos"}
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuickVenueOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Novo venue
                </Button>
              </div>

              {isConfirmedStatus ? (
                <>
                  <Select
                    value={state.venue_id != null ? String(state.venue_id) : "none"}
                    onValueChange={(v) => {
                      if (v === "none") {
                        set("venue_id", null);
                        set("venue_name", null);
                      } else {
                        const id = Number(v);
                        set("venue_id", id);
                        set("venue_name", venues.find((x) => x.id === id)?.name ?? null);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o venue confirmado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {venues.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {candidates.length > 1 && state.venue_id == null && (
                    <p className="text-xs text-amber-400">
                      Vários candidatos. Escolha um venue único para confirmar.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {candidates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {candidates.map((c) => (
                        <span
                          key={c.venue_id}
                          className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs"
                        >
                          {c.venue_name}
                          <button
                            type="button"
                            onClick={() => void removeCandidate(c.venue_id)}
                            className="ml-0.5 text-muted-foreground hover:text-destructive"
                            aria-label="Remover candidato"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <Select
                    value="_add"
                    onValueChange={(v) => {
                      if (v === "_add") return;
                      void addCandidate(Number(v));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Adicionar venue candidato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_add" disabled>Selecionar…</SelectItem>
                      {availableVenues.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            )}
            </div>

            <Field label="Descrição">
              <AutoGrowTextarea
                rows={1}
                value={state.description ?? ""}
                onChange={(v) => set("description", v || null)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              {isEdit ? (
                <Field label="Capacidade esperada">
                  <div className="flex h-10 items-center justify-between rounded-md border bg-muted/30 px-3 text-sm">
                    <span>{state.expected_capacity ?? EMPTY_VALUE}</span>
                    <button
                      type="button"
                      onClick={() => setTab("workflow")}
                      className="text-xs text-primary hover:underline"
                    >
                      alterar na Viabilidade →
                    </button>
                  </div>
                </Field>
              ) : (
                <Field label="Capacidade esperada">
                  <Input
                    type="number"
                    min={0}
                    value={state.expected_capacity ?? ""}
                    onChange={(e) =>
                      set(
                        "expected_capacity",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  />
                </Field>
              )}
              {isEdit && (
                <Field
                  label="Receita de bar (R$)"
                  hint="A parte do bar que fica com você: entra na receita e no faturamento por cabeça."
                >
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0,00"
                      value={state.bar_revenue ?? ""}
                      onChange={(e) =>
                        set("bar_revenue", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </div>
                </Field>
              )}
              {isEdit && (
                <Field
                  label="CAC-alvo (R$)"
                  hint="Quanto você aceita pagar de marketing por comprador. O cockpit compara com o CAC real."
                >
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0,00"
                      value={state.target_cac ?? ""}
                      onChange={(e) =>
                        set("target_cac", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </div>
                </Field>
              )}
            </div>

            {/* Métricas (cockpit) + briefing descem para baixo dos campos (§2.1). */}
            {isEdit && party && (
              <div className="space-y-4 border-t pt-4">
                <PartyCockpit
                  tickets={tickets}
                  items={budgetItems}
                  sponsors={state.sponsors}
                  guests={guests}
                  barRevenue={state.bar_revenue}
                  targetCac={state.target_cac}
                  expectedCapacity={state.expected_capacity}
                  actualAttendance={state.actual_attendance}
                />
                {state.status === "Realizada" && (
                  <PostEventCard partyId={party.id} title={state.title} />
                )}
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBriefingOpen(true)}>
                    <FileText className="h-4 w-4" /> Gerar briefing (por etapa)
                  </Button>
                  <BriefingDialog
                    open={briefingOpen}
                    onOpenChange={setBriefingOpen}
                    party={party}
                    stages={stages}
                    tickets={tickets}
                    budget={budgetItems}
                    lineupNames={state.lineup
                      .map((id) => contacts.find((c) => c.id === id)?.name)
                      .filter((n): n is string => !!n)}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          {/* ===== WORKFLOW (edit only) ===== */}
          {isEdit && party && (
            <TabsContent value="workflow" forceMount hidden={tab !== "workflow"} className="pt-2">
              <WorkflowTab
                partyId={party.id}
                stages={stages}
                tasks={tasks}
                budgetItems={budgetItems}
                tickets={tickets}
                venues={venues}
                confirmedVenueId={state.venue_id}
                confirmedVenueName={state.venue_name}
                expectedCapacity={state.expected_capacity}
                partyTitle={state.title}
                partyDate={state.date}
                team={state.team}
                sponsors={state.sponsors}
                lineup={state.lineup}
                lineupStatus={state.lineup_status}
                guests={guests}
                barRevenue={state.bar_revenue}
                actualAttendance={state.actual_attendance}
                onPatchParty={patchPartyLive}
                onPatchTeam={patchTeamLive}
                onPatchSponsors={patchSponsorsLive}
                onPatchLineupStatus={patchLineupStatusLive}
                onGoOrcamento={() => setTab("orcamento")}
                onOpenEquipe={() => setTab("lineup")}
                onOpenVenue={openVenue}
                onReload={loadSubTabs}
              />
            </TabsContent>
          )}

          {/* ===== LINEUP / EQUIPE ===== */}
          <TabsContent value="lineup" forceMount hidden={tab !== "lineup"} className="space-y-4 pt-2">
            {/* Sub-abas da Equipe (§2.7): Line-up | Produção | Patrocinadores. */}
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              {([["lineup", "Line-up"], ["producao", "Produção"], ["patrocinadores", "Patrocinadores"]] as const).map(
                ([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEquipeSub(k)}
                    className={cn(
                      "rounded px-3 py-1 transition",
                      equipeSub === k ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            {/* ===== LINE-UP ===== */}
            {equipeSub === "lineup" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>DJs / Músicos escalados</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuickContactOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Novo DJ / Músico
                  </Button>
                </div>
                {/* Escalação ordenada — a Operação (cronograma) puxa os sets desta ordem. */}
                {state.lineup.length > 0 && (
                  <ol className="space-y-1">
                    {state.lineup.map((cid, i) => {
                      const c = contacts.find((x) => x.id === cid);
                      return (
                        <li key={cid} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
                          <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{c?.name ?? `Contato #${cid}`}</span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() => moveLineup(i, -1)}
                              className="text-muted-foreground/50 transition hover:text-foreground disabled:opacity-30"
                              title="Subir"
                              aria-label="Subir"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={i === state.lineup.length - 1}
                              onClick={() => moveLineup(i, 1)}
                              className="text-muted-foreground/50 transition hover:text-foreground disabled:opacity-30"
                              title="Descer"
                              aria-label="Descer"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleLineup(cid)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label="Remover do line-up"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {contacts.filter((c) => !state.lineup.includes(c.id)).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {contacts
                      .filter((c) => !state.lineup.includes(c.id))
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleLineup(c.id)}
                          className="flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs transition hover:bg-accent"
                        >
                          <Plus className="h-3 w-3" /> {c.name}
                        </button>
                      ))}
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum DJ parceiro ou músico no CRM. Use "Novo DJ / Músico".
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  A ordem aqui é a escalação; a aba Operação puxa os sets desta ordem (o line-up é a fonte).
                </p>
              </div>
            )}

            {/* ===== PATROCINADORES ===== */}
            {equipeSub === "patrocinadores" && (
            <div className="space-y-3">
              <Label>Patrocinadores</Label>
              {state.sponsors.length > 0 && (
                <div className="space-y-1.5">
                  {state.sponsors.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatCurrency(s.amount_cents / 100)}
                      </span>
                      <ConfirmChip
                        status={s.status}
                        onCycle={() =>
                          patchSponsorsLive((prev) =>
                            prev.map((sp, idx) => (idx === i ? { ...sp, status: cycleConfirm(sp.status) } : sp))
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeSponsor(i)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Remover patrocinador"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      </div>
                      {s.terms && <div className="mt-0.5 text-xs text-muted-foreground">{s.terms}</div>}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome do patrocinador"
                    value={sponsorName}
                    onChange={(e) => setSponsorName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Valor (R$)"
                    value={sponsorAmount}
                    onChange={(e) => setSponsorAmount(e.target.value)}
                    className="w-36"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addSponsor}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar
                  </Button>
                </div>
                <Input
                  placeholder="Termos do acordo (contrapartidas, condições)…"
                  value={sponsorTerms}
                  onChange={(e) => setSponsorTerms(e.target.value)}
                />
              </div>
            </div>
            )}

            {/* ===== PRODUÇÃO ===== */}
            {equipeSub === "producao" && (
            <div className="space-y-3">
              <Label>Equipe de produção</Label>
              {state.team.length > 0 && (
                <div className="space-y-1.5">
                  {state.team.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                      <span className="shrink-0 text-muted-foreground">{m.role}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {m.amount_cents > 0 ? formatCurrency(m.amount_cents / 100) : EMPTY_VALUE}
                      </span>
                      <ConfirmChip
                        status={m.status}
                        onCycle={() =>
                          patchTeamLive((prev) =>
                            prev.map((tm, idx) => (idx === i ? { ...tm, status: cycleConfirm(tm.status) } : tm))
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeTeamMember(i)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Remover membro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Select
                  value={teamSupplierId !== null ? teamSupplierId.toString() : "none"}
                  onValueChange={(v) => {
                    const id = v === "none" ? null : Number(v);
                    setTeamSupplierId(id);
                    setTeamServices([]);
                    if (id !== null) {
                      const sup = suppliers.find((s) => s.id === id);
                      if (sup) setTeamName(sup.name);
                      // Puxa a tabela de serviços desse fornecedor pra preencher
                      // função + valor com um clique.
                      void listServices(id).then(setTeamServices).catch(() => setTeamServices([]));
                    } else {
                      setTeamName("");
                    }
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Fornecedor (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fornecedor</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teamServices.length > 0 && (
                  <Select
                    // remonta (reseta) quando troca de fornecedor
                    key={teamSupplierId ?? "none"}
                    onValueChange={(v) => {
                      const svc = teamServices.find((s) => s.id === Number(v));
                      if (!svc) return;
                      setTeamRole(svc.description);
                      if (svc.price != null) setTeamAmount(String(svc.price));
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Puxar serviço…" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamServices.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.description}
                          {s.price != null ? ` · ${formatCurrency(s.price)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  placeholder="Nome"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-36"
                  disabled={teamSupplierId !== null}
                />
                <Input
                  placeholder="Função"
                  value={teamRole}
                  onChange={(e) => setTeamRole(e.target.value)}
                  className="w-36"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Valor (R$)"
                  value={teamAmount}
                  onChange={(e) => setTeamAmount(e.target.value)}
                  className="w-32"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTeamMember}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              {/* Papéis comuns de produção — 1 toque preenche a Função (§2.7). */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Papéis:</span>
                {PRODUCTION_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTeamRole(r)}
                    className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            )}
          </TabsContent>

          {/* ===== ORÇAMENTO (edit only) ===== */}
          {isEdit && party && (
            <TabsContent value="orcamento" forceMount hidden={tab !== "orcamento"} className="pt-2">
              <OrcamentoTab
                party={party}
                items={budgetItems}
                tickets={tickets}
                guests={guests}
                barRevenue={state.bar_revenue}
                viabilityCostsRaw={(() => {
                  const v = stages.find((s) => s.name === "Viabilidade")?.fields.custos_necessarios;
                  return typeof v === "string" ? v : null;
                })()}
                marketingReach={Number(stages.find((s) => s.name === "Marketing")?.fields.meta_alcance) || null}
                marketingBudget={Number(stages.find((s) => s.name === "Marketing")?.fields.orcamento_mkt) || null}
                onReload={loadSubTabs}
              />
            </TabsContent>
          )}

          {/* ===== INGRESSOS (edit only) ===== */}
          {isEdit && party && (
            <TabsContent value="ingressos" forceMount hidden={tab !== "ingressos"} className="pt-2">
              <IngressosTab
                partyId={party.id}
                tickets={tickets}
                eventDate={state.date}
                onReload={loadSubTabs}
              />
            </TabsContent>
          )}

          {/* ===== OPERAÇÃO / DIA D (edit only) ===== */}
          {isEdit && party && (
            <TabsContent value="operacao" forceMount hidden={tab !== "operacao"} className="pt-2">
              <OperacaoTab
                partyId={party.id}
                // §8.4 — o line-up é a fonte da ordem: mapeia na ordem de
                // state.lineup (definida no moveLineup da aba Equipe), não na
                // ordem dos contatos. Assim os "Sets do line-up" nascem na
                // sequência certa. Espelho unidirecional: a Operação lê daqui.
                performers={state.lineup
                  .map((id) => contacts.find((c) => c.id === id))
                  .filter((c): c is Contact => !!c)
                  .map((c) => ({ id: c.id, name: c.name }))}
              />
            </TabsContent>
          )}

        </Tabs>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => confirmClose(false, () => onOpenChange(false))}
            disabled={saving}
          >
            Fechar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {party ? "Salvar alterações" : "Criar festa"}
          </Button>
        </div>
      </DialogContent>

      <QuickContactForm
        open={quickContactOpen}
        onOpenChange={setQuickContactOpen}
        defaultType="DJ parceiro"
        onCreated={async (id) => {
          const all = await listContacts();
          setContacts(all.filter((c) => c.types.some((t) => LINEUP_TYPES.includes(t))));
          toggleLineup(id);
        }}
      />

      <QuickVenueForm
        open={quickVenueOpen}
        onOpenChange={setQuickVenueOpen}
        onCreated={async (id) => {
          const all = await listVenues();
          setVenues(all);
          await addCandidate(id, all);
        }}
      />
    </Dialog>
  );
}

/**
 * Pós-evento (festa Realizada): Financeiro e Aftermovie acontecem automático;
 * mandar a guest list pro Clube de Fãs é manual (nem toda cortesia é fã).
 */
function PostEventCard({ partyId, title }: { partyId: number; title: string }) {
  const [busy, setBusy] = useState(false);
  async function sendGuestsToFans() {
    setBusy(true);
    try {
      const { added, existed } = await addPartyGuestsToFans(partyId, title);
      if (added === 0 && existed === 0) {
        toast.info("Sem cortesias na guest list para enviar.");
      } else {
        toast.success(
          `${added} cortesia(s) no Clube de Fãs${existed > 0 ? ` · ${existed} já estavam lá` : ""}.`
        );
      }
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="text-sm font-medium">Pós-evento</div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        <li>✓ Resultado lançado no <strong>Financeiro</strong> (receitas e custos reais).</li>
        <li>✓ Card de <strong>Aftermovie</strong> criado no <strong>Conteúdo</strong>.</li>
      </ul>
      <Button size="sm" variant="outline" onClick={() => void sendGuestsToFans()} disabled={busy}>
        <Plus className="h-4 w-4" /> Mandar guest list pro Clube de Fãs
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Ingressos vendidos são contagem (sem comprador individual). A fonte das cortesias é a guest list.
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </Label>
      {children}
    </div>
  );
}
