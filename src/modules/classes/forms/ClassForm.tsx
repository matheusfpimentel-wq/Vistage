import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
  type ClassPackage,
  type ClassSession,
  type ClassSessionCreateInput,
  type ClassStatus,
  type Student,
  type StudentPackage,
  type StudentPackageCreateInput,
} from "../types";
import {
  createClass,
  createStudentPackage,
  getActiveStudentPackage,
  listPackages,
  listStudentPackages,
  listStudents,
  recalcPackageUsage,
  updateClass,
} from "../api";
import { QuickStudentForm } from "./QuickStudentForm";
import { todayISO } from "@/lib/format";
import { useUnsavedConfirm } from "@/lib/dirty";

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
  const [allPackages, setAllPackages] = useState<ClassPackage[]>([]);
  const [linkPkgId, setLinkPkgId] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ student?: string; date?: string }>({});
  const [quickStudentOpen, setQuickStudentOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (session) setState(toState(session));
    else
      setState({
        ...EMPTY,
        student_id: defaultStudentId ?? 0,
      });
    setErrors({});
    setDirty(false);
  }, [session, defaultStudentId, open]);

  useEffect(() => {
    if (!open) return;
    void listStudents().then(setStudents);
    void listPackages(true).then(setAllPackages);
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
    setDirty(true);
  }

  async function handleVincularPackage() {
    if (!state.student_id || linkPkgId === null) return;
    const template = allPackages.find((p) => p.id === linkPkgId);
    if (!template) return;
    const input: StudentPackageCreateInput = {
      student_id: state.student_id,
      package_id: linkPkgId,
      total_classes: template.total_classes,
      used_classes: 0,
      purchased_at: todayISO(),
      status: "Ativo",
      notes: null,
    };
    try {
      await createStudentPackage(input);
      const pkgs = await listStudentPackages(state.student_id);
      setStudentPackages(pkgs);
      const newest = pkgs[pkgs.length - 1];
      if (newest) setState((s) => ({ ...s, student_package_id: newest.id }));
      setLinkPkgId(null);
      toast.success("Pacote vinculado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
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
      setDirty(false);
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
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
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
            <div className="flex gap-2">
              <Select
                value={state.student_id ? state.student_id.toString() : ""}
                onValueChange={(v) => set("student_id", Number(v))}
              >
                <SelectTrigger className="flex-1">
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Novo aluno"
                onClick={() => setQuickStudentOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
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
            {state.student_id > 0 && studentPackages.length === 0 && allPackages.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">Este aluno não tem pacote ativo.</p>
                <div className="flex gap-2">
                  <Select
                    value={linkPkgId !== null ? linkPkgId.toString() : ""}
                    onValueChange={(v) => setLinkPkgId(Number(v))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar pacote template" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPackages.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name} — {p.total_classes} aulas
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleVincularPackage()}
                    disabled={linkPkgId === null}
                  >
                    Vincular pacote
                  </Button>
                </div>
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

      <QuickStudentForm
        open={quickStudentOpen}
        onOpenChange={setQuickStudentOpen}
        onCreated={async (id) => {
          setStudents(await listStudents());
          set("student_id", id);
        }}
      />
    </Dialog>
  );
}
