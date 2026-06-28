import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/format";
import { useUnsavedConfirm } from "@/lib/dirty";
import { createMeeting, updateMeeting } from "../api";
import { listContacts } from "@/modules/crm/api";
import { printAta } from "../ataPrint";
import { MEETING_STATUSES, type Meeting, type MeetingStatus } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting | null;
  onSaved: () => void;
};

/** Quebra o texto de encaminhamentos em itens (uma linha = um item). */
function splitOutcomes(text: string | null): string[] {
  return (text ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•–—\s]+/, "").trim())
    .filter((l) => l.length > 0);
}

export function MeetingForm({ open, onOpenChange, meeting, onSaved }: Props) {
  const isEdit = !!meeting;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<number[]>([]);
  const [participantDraft, setParticipantDraft] = useState("");
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [outcomeItems, setOutcomeItems] = useState<string[]>([]);
  const [outcomeDraft, setOutcomeDraft] = useState("");
  const [contacts, setContacts] = useState<{ id: number; name: string }[]>([]);
  const [status, setStatus] = useState<MeetingStatus>("Agendada");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (open && meeting) {
      setTitle(meeting.title);
      setDate(meeting.date ?? "");
      setTime(meeting.time ?? "");
      setLocation(meeting.location ?? "");
      setParticipants(meeting.participants);
      setContactIds(meeting.contact_ids ?? []);
      setAgenda(meeting.agenda ?? "");
      setNotes(meeting.notes ?? "");
      setOutcomeItems(splitOutcomes(meeting.outcomes));
      setStatus(meeting.status);
    } else if (open && !meeting) {
      setTitle("");
      setDate("");
      setTime("");
      setLocation("");
      setParticipants([]);
      setContactIds([]);
      setAgenda("");
      setNotes("");
      setOutcomeItems([]);
      setStatus("Agendada");
    }
    if (open) {
      setParticipantDraft("");
      setOutcomeDraft("");
      setDirty(false);
    }
  }, [open, meeting]);

  useEffect(() => {
    void listContacts().then((cs) =>
      setContacts(cs.map((c) => ({ id: c.id, name: c.name })))
    );
  }, []);

  function addParticipant() {
    const name = participantDraft.trim();
    if (!name) return;
    if (!participants.includes(name)) {
      setParticipants((prev) => [...prev, name]);
      setDirty(true);
    }
    setParticipantDraft("");
  }

  function removeParticipant(name: string) {
    setParticipants((prev) => prev.filter((p) => p !== name));
    const c = contacts.find((x) => x.name === name);
    if (c) setContactIds((prev) => prev.filter((id) => id !== c.id));
    setDirty(true);
  }

  function addOutcome() {
    const t = outcomeDraft.trim();
    if (t && !outcomeItems.includes(t)) {
      setOutcomeItems((prev) => [...prev, t]);
      setDirty(true);
    }
    setOutcomeDraft("");
  }

  function removeOutcome(idx: number) {
    setOutcomeItems((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        date: date || null,
        time: time || null,
        location: location.trim() || null,
        participants,
        contact_ids: contactIds,
        agenda: agenda.trim() || null,
        notes: notes.trim() || null,
        outcomes: outcomeItems.join("\n").trim() || null,
        status,
      };
      if (isEdit && meeting) {
        await updateMeeting({ id: meeting.id, ...payload });
      } else {
        await createMeeting(payload);
      }
      toast.success(isEdit ? "Reunião atualizada" : "Reunião criada");
      setDirty(false);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar reunião" : "Nova reunião"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="form">
          <TabsList>
            <TabsTrigger value="form">Reunião</TabsTrigger>
            <TabsTrigger value="ata">Ata</TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="meet-title">Título *</Label>
            <Input
              id="meet-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
              placeholder="Ex: Alinhamento com produtora"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="meet-date">Data</Label>
              <Input
                id="meet-date"
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setDirty(true); }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="meet-time">Horário</Label>
              <Input
                id="meet-time"
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); setDirty(true); }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="meet-location">Local / link</Label>
              <Input
                id="meet-location"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setDirty(true); }}
                placeholder="Estúdio, endereço ou link da chamada"
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v as MeetingStatus); setDirty(true); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="meet-participants">Participantes</Label>
            <Input
              id="meet-participants"
              value={participantDraft}
              onChange={(e) => setParticipantDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addParticipant();
                }
              }}
              onBlur={addParticipant}
              placeholder="Digite um nome e pressione Enter"
            />
            {contacts.length > 0 && (
              <Select
                value=""
                onValueChange={(idStr) => {
                  const c = contacts.find((x) => String(x.id) === idStr);
                  if (!c) return;
                  setParticipants((prev) => (prev.includes(c.name) ? prev : [...prev, c.name]));
                  setContactIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
                  setDirty(true);
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="+ Vincular pessoa (CRM)" />
                </SelectTrigger>
                <SelectContent>
                  {contacts
                    .filter((c) => !contactIds.includes(c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {contactIds.length > 0 && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                {contactIds.length} pessoa(s) vinculada(s) — a reunião aparece no perfil delas.
              </p>
            )}
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {participants.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1">
                    {p}
                    <button
                      type="button"
                      onClick={() => removeParticipant(p)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remover ${p}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="meet-agenda">Pauta</Label>
            <textarea
              id="meet-agenda"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={agenda}
              onChange={(e) => { setAgenda(e.target.value); setDirty(true); }}
              placeholder="Tópicos a tratar..."
            />
          </div>
          </TabsContent>

          <TabsContent value="ata" className="space-y-4 pt-2">
            {/* Cabeçalho de contexto (somente leitura) — vem da aba Reunião. */}
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <h3 className="text-sm font-semibold leading-tight">
                {title.trim() || "Reunião sem título"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {[date ? formatDate(date) : null, time || null, location.trim() || null]
                  .filter(Boolean)
                  .join(" · ") || "Sem data"}
                {participants.length > 0 && ` · ${participants.length} participante(s)`}
              </p>
            </div>

            {/* Edição da ata propriamente dita. */}
            <div className="space-y-1">
              <Label htmlFor="ata-notes">Texto da ata</Label>
              <textarea
                id="ata-notes"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                rows={8}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                placeholder="Registro do que foi discutido na reunião…"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ata-outcomes">Encaminhamentos</Label>
              <Input
                id="ata-outcomes"
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOutcome();
                  }
                }}
                onBlur={addOutcome}
                placeholder="Digite um encaminhamento e pressione Enter"
              />
              {outcomeItems.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {outcomeItems.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-sm"
                    >
                      <span className="flex-1">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeOutcome(idx)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remover encaminhamento"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                Cada item pode virar uma tarefa — use "Gerar tarefas" na lista de reuniões.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() =>
                  void printAta({ title, date, time, location, participants, notes, outcomes: outcomeItems.join("\n") })
                }
              >
                <Printer className="h-4 w-4" /> Imprimir ata
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
