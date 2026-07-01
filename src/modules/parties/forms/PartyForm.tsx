import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, toLocalISODate } from "@/lib/format";
import { onEnterSave } from "@/lib/formEnter";
import {
  Dialog,
  DialogContent,
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
import { cn } from "@/lib/utils";
import { useUnsavedConfirm } from "@/lib/dirty";
import { listContacts } from "@/modules/crm/api";
import { QuickContactForm } from "@/modules/crm/forms/QuickContactForm";
import type { Contact } from "@/modules/crm/types";
import { listContent, createContent, listContentPromoting } from "@/modules/content/api";
import { CONTENT_FORMATS, CONTENT_NETWORKS, type Content } from "@/modules/content/types";
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
  type PartyDeserialized,
  type PartyStatus,
  type PartyTeamMember,
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
  sponsors: { name: string; amount_cents: number }[];
  team: PartyTeamMember[];
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
  notes: null,
  gig_id: null,
};

const LINEUP_TYPES = ["DJ parceiro", "Músico"];

// Candidato local (festa nova, ainda sem id): só venue_id + nome para exibir.
type LocalCandidate = { venue_id: number; venue_name: string };

export function PartyForm({ open, onOpenChange, party, onSaved }: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [linkedContent, setLinkedContent] = useState<Content[]>([]);
  const [promotingContent, setPromotingContent] = useState<
    { id: number; title: string; status: string }[]
  >([]);
  const [quickContent, setQuickContent] = useState(false);
  const [quickContentForm, setQuickContentForm] = useState({ title: "", format: "", network: "", status: "Ideia" as string });
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

  const confirmClose = useUnsavedConfirm(dirty);
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

  const reloadLinkedContent = useCallback(async (title: string) => {
    const all = await listContent();
    const lower = title.toLowerCase();
    setLinkedContent(all.filter((c) => c.title.toLowerCase().includes(lower)));
  }, []);

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
      void reloadLinkedContent(party.title);
      void listContentPromoting("Festa", party.id).then(setPromotingContent);
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
        notes: party.notes,
        gig_id: party.gig_id,
      });
      void loadCandidates();
      void loadSubTabs();
    } else {
      setState(EMPTY);
      setPromotingContent([]);
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
    set("sponsors", [...state.sponsors, { name, amount_cents: cents }]);
    setSponsorName("");
    setSponsorAmount("");
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

  async function handleCreateQuickContent() {
    const typed = quickContentForm.title.trim();
    if (!typed) {
      toast.error("Título é obrigatório");
      return;
    }
    // Garante que o conteúdo apareça na lista vinculada (filtrada pelo nome
    // da festa): se o título digitado não contém o nome da festa, prefixa.
    const title = typed.toLowerCase().includes(state.title.toLowerCase())
      ? typed
      : `${state.title} — ${typed}`;
    try {
      await createContent({
        title,
        script: null,
        networks: quickContentForm.network ? [quickContentForm.network as never] : [],
        format: (quickContentForm.format as never) || null,
        purpose: null,
        status: quickContentForm.status as never,
        due_date: null,
        publish_date: null,
        published_at: null,
        post_url: null,
        metric_views: null,
        metric_likes: null,
        metric_comments: null,
        metric_shares: null,
        metric_saves: null,
        notes: null,
        task_id: null,
      });
      setQuickContent(false);
      setQuickContentForm({ title: "", format: "", network: "", status: "Ideia" });
      await reloadLinkedContent(state.title);
      toast.success("Conteúdo criado");
    } catch {
      toast.error("Erro ao criar conteúdo");
    }
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
            {isEdit && <TabsTrigger value="orcamento">Orçamento</TabsTrigger>}
            {isEdit && <TabsTrigger value="ingressos">Ingressos</TabsTrigger>}
            {isEdit && <TabsTrigger value="operacao">Operação</TabsTrigger>}
            {isEdit && <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>}
            <TabsTrigger value="notas">Notas</TabsTrigger>
          </TabsList>

          {/* ===== INFO ===== */}
          <TabsContent value="info" forceMount hidden={tab !== "info"} className="space-y-4 pt-2">
            {isEdit && party && (
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
            )}
            {isEdit && party && state.status === "Realizada" && (
              <PostEventCard partyId={party.id} title={state.title} />
            )}
            {isEdit && party && (
              <SeriesEditionCard
                partyId={party.id}
                seriesId={party.series_id}
                editionLabel={party.edition_label}
                editionNumber={party.edition_number}
                partyTitle={state.title}
              />
            )}
            {isEdit && party && (
              <>
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
              </>
            )}
            <Field label="Título *">
              <Input
                value={state.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder='Ex: "Party Night Vol. 3"'
              />
            </Field>

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
                    Sugestão: marcar como <strong>{suggested}</strong> — {reason}.
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

            <Field label="GIG vinculada (se você toca na própria festa)">
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
                      {g.date ? ` — ${g.date}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* ===== VENUES ===== */}
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

            <Field label="Descrição">
              <Textarea
                rows={3}
                value={state.description ?? ""}
                onChange={(e) => set("description", e.target.value || null)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
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
              {isEdit && (
                <Field label="Público real">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Computado dos ingressos:{" "}
                      <strong className="text-foreground">{ticketsSold}</strong> vendido(s).
                    </p>
                    <Input
                      type="number"
                      min={0}
                      placeholder={`Contagem na portaria (sobrepõe · padrão ${ticketsSold})`}
                      value={state.actual_attendance ?? ""}
                      onChange={(e) =>
                        set(
                          "actual_attendance",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                    />
                  </div>
                </Field>
              )}
              {isEdit && (
                <Field label="Receita de bar (R$)">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      A parte do bar que fica com você — entra na receita e no faturamento por cabeça.
                    </p>
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
                <Field label="CAC-alvo (R$)">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Quanto você aceita pagar de marketing por comprador. O cockpit compara com o CAC real.
                    </p>
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
          </TabsContent>

          {/* ===== WORKFLOW (edit only) ===== */}
          {isEdit && party && (
            <TabsContent value="workflow" forceMount hidden={tab !== "workflow"} className="pt-2">
              <WorkflowTab
                partyId={party.id}
                stages={stages}
                tasks={tasks}
                expectedCapacity={state.expected_capacity}
                onReload={loadSubTabs}
              />
            </TabsContent>
          )}

          {/* ===== LINEUP / EQUIPE ===== */}
          <TabsContent value="lineup" forceMount hidden={tab !== "lineup"} className="space-y-6 pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>DJs / Músicos escalados</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuickContactOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Novo DJ / Músico
                </Button>
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum DJ parceiro ou músico no CRM. Use "Novo DJ / Músico".
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleLineup(c.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition",
                        state.lineup.includes(c.id)
                          ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
                          : "border-input hover:bg-accent"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Patrocinadores</Label>
              {state.sponsors.length > 0 && (
                <div className="space-y-1.5">
                  {state.sponsors.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(s.amount_cents / 100)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSponsor(i)}
                        className="ml-2 text-muted-foreground hover:text-destructive"
                        aria-label="Remover patrocinador"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                  <Plus className="h-3.5 w-3.5" /> Adicionar patrocinador
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Equipe de produção</Label>
              {state.team.length > 0 && (
                <div className="space-y-1.5">
                  {state.team.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground">{m.role}</span>
                      <span className="text-muted-foreground">
                        {m.amount_cents > 0 ? formatCurrency(m.amount_cents / 100) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTeamMember(i)}
                        className="ml-2 text-muted-foreground hover:text-destructive"
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
                          {s.price != null ? ` — ${formatCurrency(s.price)}` : ""}
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
            </div>
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
                performers={contacts
                  .filter((c) => state.lineup.includes(c.id))
                  .map((c) => ({ id: c.id, name: c.name }))}
              />
            </TabsContent>
          )}

          {/* ===== CONTEÚDO VINCULADO ===== */}
          {isEdit && (
            <TabsContent value="conteudo" forceMount hidden={tab !== "conteudo"} className="space-y-3 pt-2">
              {promotingContent.length > 0 && (
                <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Conteúdos promovendo esta Festa
                  </p>
                  {promotingContent.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{c.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {linkedContent.length} conteúdo{linkedContent.length !== 1 ? "s" : ""} vinculado{linkedContent.length !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQuickContentForm({ title: state.title + " — ", format: "", network: "", status: "Ideia" });
                    setQuickContent(true);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> Novo conteúdo
                </button>
              </div>

              {quickContent && (
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs font-medium">Novo conteúdo</p>
                  <Input
                    value={quickContentForm.title}
                    onChange={(e) => setQuickContentForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Título do conteúdo"
                    className="h-8 text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={quickContentForm.format}
                      onChange={(e) => setQuickContentForm((f) => ({ ...f, format: e.target.value }))}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="">Formato…</option>
                      {CONTENT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select
                      value={quickContentForm.network}
                      onChange={(e) => setQuickContentForm((f) => ({ ...f, network: e.target.value }))}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="">Rede…</option>
                      {CONTENT_NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={quickContentForm.status}
                      onChange={(e) => setQuickContentForm((f) => ({ ...f, status: e.target.value }))}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      {["Ideia","Roteiro","Gravando","Edição","Pronto"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateQuickContent} className="h-7 text-xs">Criar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setQuickContent(false)} className="h-7 text-xs">Cancelar</Button>
                  </div>
                </div>
              )}

              {linkedContent.length === 0 && !quickContent ? (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhum conteúdo com o nome desta festa encontrado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {linkedContent.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{c.title}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {c.format && <span>{c.format}</span>}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5",
                            c.status === "Publicado"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* ===== NOTAS ===== */}
          <TabsContent value="notas" forceMount hidden={tab !== "notas"} className="pt-2">
            <Field label="Notas">
              <Textarea
                rows={6}
                value={state.notes ?? ""}
                onChange={(e) => set("notes", e.target.value || null)}
                placeholder="Observações, lembretes, detalhes logísticos…"
              />
            </Field>
          </TabsContent>
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
        Ingressos vendidos são contagem (sem comprador individual) — a fonte das cortesias é a guest list.
      </p>
    </div>
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
