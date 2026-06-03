import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { toast } from "@/components/ui/toaster";
import {
  ACQUISITION_SOURCES,
  type AcquisitionSource,
  type Student,
  type StudentCreateInput,
} from "../types";
import { createStudent, updateStudent } from "../api";
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
  onSaved: (id: number) => void;
};

const EMPTY: StudentCreateInput = {
  name: "",
  phone: null,
  email: null,
  instagram: null,
  city: null,
  acquisition: null,
  notes: null,
};

function toState(s: Student): StudentCreateInput {
  return {
    name: s.name,
    phone: s.phone,
    email: s.email,
    instagram: s.instagram,
    city: s.city,
    acquisition: s.acquisition,
    notes: s.notes,
  };
}

export function StudentForm({ open, onOpenChange, student, onSaved }: Props) {
  const [state, setState] = useState<StudentCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (student) setState(toState(student));
    else setState(EMPTY);
    setNameError(null);
    setDirty(false);
  }, [student, open]);

  function set<K extends keyof StudentCreateInput>(
    key: K,
    value: StudentCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  async function handleSubmit() {
    if (!state.name.trim()) {
      setNameError("Obrigatório");
      toast.error("O nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const id = student
        ? (await updateStudent({ id: student.id, ...state }), student.id)
        : await createStudent(state);
      toast.success(student ? "Aluno atualizado" : "Aluno criado");
      setDirty(false);
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{student ? "Editar aluno" : "Novo aluno"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              value={state.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (nameError) setNameError(null);
              }}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Telefone">
              <Input
                value={state.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={state.email ?? ""}
                onChange={(e) => set("email", e.target.value || null)}
              />
            </Field>
            <Field label="Instagram">
              <Input
                placeholder="@aluno"
                value={state.instagram ?? ""}
                onChange={(e) => set("instagram", e.target.value || null)}
              />
            </Field>
            <Field label="Cidade">
              <Input
                value={state.city ?? ""}
                onChange={(e) => set("city", e.target.value || null)}
              />
            </Field>
          </div>

          <Field label="Como te conheceu? (modo de captação)">
            <Select
              value={state.acquisition ?? "none"}
              onValueChange={(v) =>
                set("acquisition", v === "none" ? null : (v as AcquisitionSource))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {ACQUISITION_SOURCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Notas">
            <Textarea
              rows={3}
              placeholder="Objetivos do aluno, gosto musical, nível…"
              value={state.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
            />
          </Field>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {student ? "Salvar alterações" : "Criar aluno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
