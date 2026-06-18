import { useEffect, useState } from "react";
import {
  CalendarClock,
  ListTodo,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import {
  createFollowUpTask,
  deleteMeeting,
  listMeetings,
  updateMeeting,
} from "./api";
import { MeetingForm } from "./forms/MeetingForm";
import { LinkedTasksList } from "@/modules/tasks/components/LinkedTasksList";
import {
  MEETING_STATUSES,
  meetingStatusVariant,
  type Meeting,
  type MeetingStatus,
} from "./types";
import { PageToolbar } from "@/components/shared/PageToolbar";

function formatWhen(m: Meeting): string {
  if (!m.date) return "Sem data";
  const d = new Date(`${m.date}T${m.time || "12:00"}:00`);
  const datePart = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return m.time ? `${datePart} · ${m.time}` : datePart;
}

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | "Todas">("Todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [followUpFor, setFollowUpFor] = useState<Meeting | null>(null);

  async function refresh() {
    setMeetings(await listMeetings());
  }

  useEffect(() => { void refresh(); }, []);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(m: Meeting) {
    setEditing(m);
    setFormOpen(true);
  }

  async function remove(m: Meeting) {
    const ok = await confirmDialog({
      title: "Excluir reunião",
      description: `Excluir "${m.title}"? A tarefa-lembrete vinculada também será removida.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteMeeting(m.id);
    toast.success("Reunião excluída");
    void refresh();
  }

  async function setStatus(m: Meeting, status: MeetingStatus) {
    await updateMeeting({ id: m.id, status });
    void refresh();
    if (status === "Realizada") setFollowUpFor({ ...m, status });
  }

  const visible = meetings.filter(
    (m) => statusFilter === "Todas" || m.status === statusFilter
  );

  return (
    <div className="space-y-4">
      <PageToolbar
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova reunião
          </Button>
        }
      >
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MeetingStatus | "Todas")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todas</SelectItem>
            {MEETING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageToolbar>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhuma reunião {statusFilter !== "Todas" ? `${statusFilter.toLowerCase()}` : ""} ainda.
          Marque uma reunião e ela vira uma tarefa-lembrete automaticamente.
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((m) => (
            <div key={m.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    <Badge variant={meetingStatusVariant(m.status)}>{m.status}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" /> {formatWhen(m)}
                    </span>
                    {m.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {m.location}
                      </span>
                    )}
                    {m.participants.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {m.participants.length}
                      </span>
                    )}
                  </div>
                  {m.agenda && (
                    <p className="line-clamp-2 pt-1 text-sm text-muted-foreground">{m.agenda}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFollowUpFor(m)} aria-label="Gerar tarefa de follow-up">
                    <ListTodo className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => void remove(m)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {m.status === "Agendada" && (
                <div className="mt-3 flex gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" onClick={() => void setStatus(m, "Realizada")}>
                    Marcar como realizada
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(m, "Cancelada")}>
                    Cancelar reunião
                  </Button>
                </div>
              )}

              {m.outcomes && (
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Decisões</div>
                  {m.outcomes}
                </div>
              )}

              <div className="mt-3 border-t pt-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Tarefas vinculadas</div>
                <LinkedTasksList entityType="meeting" entityId={m.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      <MeetingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        meeting={editing}
        onSaved={refresh}
      />

      <FollowUpDialog
        meeting={followUpFor}
        onOpenChange={(open) => { if (!open) setFollowUpFor(null); }}
      />
    </div>
  );
}

function FollowUpDialog({
  meeting,
  onOpenChange,
}: {
  meeting: Meeting | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meeting) {
      setTitle("");
      setDue("");
    }
  }, [meeting]);

  async function save() {
    if (!meeting || !title.trim()) {
      toast.error("Descreva a tarefa");
      return;
    }
    setSaving(true);
    try {
      await createFollowUpTask(meeting, { title: title.trim(), due_date: due || null });
      toast.success("Tarefa criada a partir da reunião");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!meeting} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tarefa a partir da reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {meeting && (
            <p className="text-xs text-muted-foreground">
              Follow-up de <span className="font-medium text-foreground">{meeting.title}</span>
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="fu-title">Tarefa *</Label>
            <Input
              id="fu-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Enviar proposta revisada"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fu-due">Vencimento</Label>
            <Input id="fu-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando..." : "Criar tarefa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
