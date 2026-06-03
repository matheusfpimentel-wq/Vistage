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
import { toast } from "@/components/ui/toaster";
import { createStudent } from "../api";
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
};

/** Dialog mínimo pra cadastrar um aluno só com nome. Resto edita depois. */
export function QuickStudentForm({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (open) {
      setName("");
      setDirty(false);
    }
  }, [open]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const id = await createStudent({
        name: name.trim(),
        phone: null,
        email: null,
        instagram: null,
        city: null,
        acquisition: null,
        notes: null,
      });
      toast.success("Aluno criado");
      setDirty(false);
      onCreated(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo aluno</DialogTitle>
          <DialogDescription>
            Só o nome agora. Completa o resto depois em Aulas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                e.preventDefault();
                void handleSave();
              }
            }}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
