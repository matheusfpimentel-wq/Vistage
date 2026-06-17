import { useEffect, useState } from "react";
import { X } from "lucide-react";
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
import { toast } from "@/components/ui/toaster";
import { useUnsavedConfirm } from "@/lib/dirty";
import { createMeeting, updateMeeting } from "../api";
import { MEETING_STATUSES, type Meeting, type MeetingStatus } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting | null;
  onSaved: () => void;
};

export function MeetingForm({ open, onOpenChange, meeting, onSaved }: Props) {
  const isEdit = !!meeting;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantDraft, setParticipantDraft] = useState("");
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [outcomes, setOutcomes] = useState("");
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
      setAgenda(meeting.agenda ?? "");
      setNotes(meeting.notes ?? "");
      setOutcomes(meeting.outcomes ?? "");
      setStatus(meeting.status);
    } else if (open && !meeting) {
      setTitle("");
      setDate("");
      setTime("");
      setLocation("");
      setParticipants([]);
      setAgenda("");
      setNotes("");
      setOutcomes("");
      setStatus("Agendada");
    }
    if (open) {
      setParticipantDraft("");
      setDirty(false);
    }
  }, [open, meeting]);

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
        agenda: agenda.trim() || null,
        notes: notes.trim() || null,
        outcomes: outcomes.trim() || null,
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

        <div className="space-y-4">
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

          <div className="space-y-1">
            <Label htmlFor="meet-notes">Ata</Label>
            <textarea
              id="meet-notes"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              placeholder="O que foi discutido..."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="meet-outcomes">Decisões</Label>
            <textarea
              id="meet-outcomes"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              value={outcomes}
              onChange={(e) => { setOutcomes(e.target.value); setDirty(true); }}
              placeholder="O que ficou decidido e os próximos passos..."
            />
          </div>
        </div>

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
