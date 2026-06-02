import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatDate } from "@/lib/format";
import { listContacts } from "@/modules/crm/api";
import { QuickContactForm } from "@/modules/crm/forms/QuickContactForm";
import type { Contact } from "@/modules/crm/types";
import { listContent } from "@/modules/content/api";
import type { Content } from "@/modules/content/types";
import {
  PARTY_STATUSES,
  PARTY_COST_CATEGORIES,
  type PartyDeserialized,
  type PartyStatus,
  type PartyCost,
} from "../types";
import {
  createParty,
  updateParty,
  listPartyCosts,
  createPartyCost,
  deletePartyCost,
  autoGeneratePartyTasks,
} from "../api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party?: PartyDeserialized | null;
  onSaved: () => void;
};

type FormState = {
  title: string;
  date: string | null;
  venue_name: string | null;
  status: PartyStatus;
  description: string | null;
  expected_capacity: number | null;
  actual_attendance: number | null;
  lineup: number[];
  sponsors: { name: string; amount_cents: number }[];
  notes: string | null;
};

const EMPTY: FormState = {
  title: "",
  date: null,
  venue_name: null,
  status: "Planejando",
  description: null,
  expected_capacity: null,
  actual_attendance: null,
  lineup: [],
  sponsors: [],
  notes: null,
};

const LINEUP_TYPES = ["DJ parceiro", "Músico"];

const formatCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PartyForm({ open, onOpenChange, party, onSaved }: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [linkedContent, setLinkedContent] = useState<Content[]>([]);
  const [costs, setCosts] = useState<PartyCost[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [costCategory, setCostCategory] = useState<string>("");
  const [costDesc, setCostDesc] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costDate, setCostDate] = useState("");
  const [addingCost, setAddingCost] = useState(false);

  const [sponsorName, setSponsorName] = useState("");
  const [sponsorAmount, setSponsorAmount] = useState("");

  const confirmClose = useUnsavedConfirm(dirty);
  const isEdit = !!party;

  const loadCosts = useCallback(async () => {
    if (!party) return;
    const rows = await listPartyCosts(party.id);
    setCosts(rows);
  }, [party]);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setCostCategory("");
    setCostDesc("");
    setCostAmount("");
    setCostDate("");
    setSponsorName("");
    setSponsorAmount("");

    void listContacts().then((all) =>
      setContacts(
        all.filter((c) => c.types.some((t) => LINEUP_TYPES.includes(t)))
      )
    );

    if (party) {
      void listContent().then((all) => {
        const titleLower = party.title.toLowerCase();
        setLinkedContent(
          all.filter((c) => c.title.toLowerCase().includes(titleLower))
        );
      });
      setState({
        title: party.title,
        date: party.date,
        venue_name: party.venue_name,
        status: party.status,
        description: party.description,
        expected_capacity: party.expected_capacity,
        actual_attendance: party.actual_attendance,
        lineup: party.lineup,
        sponsors: party.sponsors,
        notes: party.notes,
      });
      void loadCosts();
    } else {
      setState(EMPTY);
      setCosts([]);
    }
  }, [open, party, loadCosts]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function toggleLineup(id: number) {
    set(
      "lineup",
      state.lineup.includes(id)
        ? state.lineup.filter((x) => x !== id)
        : [...state.lineup, id]
    );
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

  async function handleAddCost() {
    if (!party) return;
    const amount = parseFloat(costAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor válido para o custo");
      return;
    }
    setAddingCost(true);
    try {
      await createPartyCost(
        party.id,
        costCategory || null,
        costDesc.trim() || null,
        amount,
        costDate || null
      );
      setCostCategory("");
      setCostDesc("");
      setCostAmount("");
      setCostDate("");
      await loadCosts();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAddingCost(false);
    }
  }

  async function handleDeleteCost(id: number) {
    try {
      await deletePartyCost(id);
      await loadCosts();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleSubmit() {
    if (!state.title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...state,
        venue_id: null,
        ticket_price_regular: null,
        ticket_price_vip: null,
        lineup: state.lineup,
        sponsors: state.sponsors,
      };

      if (party) {
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
        if (state.status === "Confirmada") {
          const fresh: PartyDeserialized = {
            id,
            ...payload,
            stage_current: null,
            financial_synced: 0,
            tasks_generated: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await autoGeneratePartyTasks(fresh);
          toast.success("4 tarefas criadas");
        }
        toast.success("Festa criada");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const totalCosts = costs.reduce((acc, c) => acc + c.amount, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{party ? "Editar festa" : "Nova festa"}</DialogTitle>
          <DialogDescription>
            Gerencie produção, lineup e custos do evento.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="lineup">Lineup</TabsTrigger>
            {isEdit && <TabsTrigger value="custos">Custos</TabsTrigger>}
            {isEdit && <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>}
            <TabsTrigger value="notas">Notas</TabsTrigger>
          </TabsList>

          {/* ===== INFO ===== */}
          <TabsContent value="info" className="space-y-4 pt-2">
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
                  onValueChange={(v) => set("status", v as PartyStatus)}
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

            <Field label="Venue">
              <Input
                value={state.venue_name ?? ""}
                onChange={(e) => set("venue_name", e.target.value || null)}
                placeholder="Nome do local"
              />
            </Field>

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
                  <Input
                    type="number"
                    min={0}
                    value={state.actual_attendance ?? ""}
                    onChange={(e) =>
                      set(
                        "actual_attendance",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  />
                </Field>
              )}
            </div>

          </TabsContent>

          {/* ===== LINEUP ===== */}
          <TabsContent value="lineup" className="space-y-6 pt-2">
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
                          ? "border-primary bg-primary text-primary-foreground"
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
          </TabsContent>

          {/* ===== CUSTOS (edit only) ===== */}
          {isEdit && (
            <TabsContent value="custos" className="space-y-4 pt-2">
              <div className="grid gap-2 sm:grid-cols-4">
                <Select value={costCategory} onValueChange={setCostCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_COST_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Descrição"
                  value={costDesc}
                  onChange={(e) => setCostDesc(e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Valor (R$)"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={costDate}
                    onChange={(e) => setCostDate(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleAddCost()}
                    disabled={addingCost}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {costs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum custo registrado.</p>
              ) : (
                <div className="space-y-1.5">
                  {costs.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      {c.category && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {c.category}
                        </span>
                      )}
                      <span className="flex-1 truncate text-muted-foreground">
                        {c.description ?? "—"}
                      </span>
                      {c.date && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(c.date)}
                        </span>
                      )}
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrency(c.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCost(c.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Excluir custo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1 text-sm font-semibold">
                    Total: {formatCurrency(totalCosts)}
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {/* ===== CONTEÚDO VINCULADO ===== */}
          {isEdit && (
            <TabsContent value="conteudo" className="space-y-3 pt-2">
              {linkedContent.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum conteúdo com o nome desta festa encontrado. Crie posts
                  no módulo Conteúdo mencionando "{state.title}" no título.
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
          <TabsContent value="notas" className="pt-2">
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
