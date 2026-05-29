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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import {
  CLASS_STATUSES,
  type ClassSession,
  type ClassSessionCreateInput,
  type ClassStatus,
  type Student,
  type StudentPackage,
} from "../types";
import {
  createClass,
  getActiveStudentPackage,
  listStudentPackages,
  listStudents,
  recalcPackageUsage,
  updateClass,
} from "../api";
import { todayISO } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: ClassSession | null;
  defaultStudentId?: number;
  onSaved: () => void;
};

const EMPTY: ClassSessionCreateInput = {
  student_id: 0,
  student_package_id: null,
  date: todayISO(),
  start_time: null,
  duration_min: 60,
  subject: null,
  status: "Agendada",
  feedback: null,
  amount: null,
  notes: null,
};

function toState(c: ClassSession): ClassSessionCreateInput {
  return {
    student_id: c.student_id,
    student_package_id: c.student_package_id,
    date: c.date,
    start_time: c.start_time,
    duration_min: c.duration_min,
    subject: c.subject,
    status: c.status,
    feedback: c.feedback,
    amount: c.amount,
    notes: c.notes,
  };
}

export function ClassForm({
  open,
  onOpenChange,
  session,
  defaultStudentId,
  onSaved,
}: Props) {
  const [state, setState] = useState<ClassSessionCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentPackages, setStudentPackages] = useState<StudentPackage[]>([]);
  const [errors, setErrors] = useState<{ student?: string; date?: string }>({});

  useEffect(() => {
    if (session) setState(toState(session));
    else
      setState({
        ...EMPTY,
        student_id: defaultStudentId ?? 0,
      });
    setErrors({});
  }, [session, defaultStudentId, open]);

  useEffect(() => {
    if (!open) return;
    void listStudents().then(setStudents);
  }, [open]);

  // Quando muda o aluno, busca os pacotes ativos dele e tenta auto-vincular
  useEffect(() => {
    if (!open || !state.student_id) {
      setStudentPackages([]);
      return;
    }
    (async () => {
      const pkgs = await listStudentPackages(state.student_id);
      setStudentPackages(pkgs);
      // Pré-seleciona o pacote ativo só na criação
      if (!session && state.student_package_id === null) {
        const active = await getActiveStudentPackage(state.student_id);
        if (active) {
          setState((s) => ({ ...s, student_package_id: active.id }));
        }
      }
    })();
  }, [open, state.student_id, session]);

  function set<K extends keyof ClassSessionCreateInput>(
    key: K,
    value: ClassSessionCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!state.student_id) e.student = "Selecione um aluno";
    if (!state.date) e.date = "Obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    try {
      const prevPackageId = session?.student_package_id ?? null;
      const newPackageId = state.student_package_id;

      if (session) {
        await updateClass({ id: session.id, ...state });
      } else {
        await createClass(state);
      }

      // recalcula saldo do pacote afetado (anterior e novo, se mudaram)
      if (prevPackageId) await recalcPackageUsage(prevPackageId);
      if (newPackageId && newPackageId !== prevPackageId)
        await recalcPackageUsage(newPackageId);
      else if (newPackageId) await recalcPackageUsage(newPackageId);

      toast.success(session ? "Aula atualizada" : "Aula agendada");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedPkg = studentPackages.find(
    (p) => p.id === state.student_package_id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session ? "Editar aula" : "Nova aula"}</DialogTitle>
          <DialogDescription>
            Marque como "Realizada" pra consumir uma aula do pacote selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Aluno <span className="text-destructive">*</span>
            </Label>
            <Select
              value={state.student_id ? state.student_id.toString() : ""}
              onValueChange={(v) => set("student_id", Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.student && (
              <p className="text-xs text-destructive">{errors.student}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Modalidade</Label>
            <Select
              value={
                state.student_package_id === null
                  ? "avulsa"
                  : state.student_package_id.toString()
              }
              onValueChange={(v) =>
                set("student_package_id", v === "avulsa" ? null : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avulsa">Aula avulsa</SelectItem>
                {studentPackages.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    Pacote #{p.id} — {p.used_classes}/{p.total_classes} usadas ·{" "}
                    {p.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPkg && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  Saldo: {selectedPkg.total_classes - selectedPkg.used_classes} aulas
                </Badge>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Data <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={state.date}
                onChange={(e) => set("date", e.target.value)}
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input
                type="time"
                value={state.start_time ?? ""}
                onChange={(e) => set("start_time", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duração (min)</Label>
              <Input
                type="number"
                min={15}
                step={15}
                value={state.duration_min ?? ""}
                onChange={(e) =>
                  set("duration_min", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={state.status}
                onValueChange={(v) => set("status", v as ClassStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Valor (R$){" "}
                <span className="text-xs text-muted-foreground">
                  {selectedPkg ? "(opcional — pacote)" : "(avulsa)"}
                </span>
              </Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={state.amount ?? ""}
                onChange={(e) =>
                  set("amount", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Matéria a ser passada</Label>
            <Textarea
              rows={3}
              placeholder="Ex: Beatmatching avançado, transições harmônicas, treino de ouvido…"
              value={state.subject ?? ""}
              onChange={(e) => set("subject", e.target.value || null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Feedback geral</Label>
            <Textarea
              rows={3}
              placeholder="Como foi a aula, o que evoluir, o que reforçar na próxima…"
              value={state.feedback ?? ""}
              onChange={(e) => set("feedback", e.target.value || null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas internas</Label>
            <Textarea
              rows={2}
              value={state.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {session ? "Salvar" : "Agendar aula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
