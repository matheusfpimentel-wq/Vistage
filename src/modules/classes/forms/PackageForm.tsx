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
import { toast } from "@/components/ui/toaster";
import { createPackage, updatePackage } from "../api";
import type { ClassPackage, ClassPackageCreateInput } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg?: ClassPackage | null;
  onSaved: () => void;
};

const EMPTY: ClassPackageCreateInput = {
  name: "",
  total_classes: 4,
  price: null,
  description: null,
  syllabus: null,
  active: 1,
};

export function PackageForm({ open, onOpenChange, pkg, onSaved }: Props) {
  const [state, setState] = useState<ClassPackageCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pkg)
      setState({
        name: pkg.name,
        total_classes: pkg.total_classes,
        price: pkg.price,
        description: pkg.description,
        syllabus: pkg.syllabus,
        active: pkg.active,
      });
    else setState(EMPTY);
  }, [pkg, open]);

  async function handleSubmit() {
    if (!state.name.trim() || state.total_classes < 1) {
      toast.error("Preencha nome e número de aulas");
      return;
    }
    setSaving(true);
    try {
      if (pkg) await updatePackage({ id: pkg.id, ...state });
      else await createPackage(state);
      toast.success(pkg ? "Pacote atualizado" : "Pacote criado");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pkg ? "Editar pacote" : "Novo pacote"}</DialogTitle>
          <DialogDescription>
            Template reutilizável. Ao vender pra um aluno, é gerada uma instância
            com o saldo de aulas e o status Ativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              placeholder='Ex: "Mensal 4 aulas"'
              value={state.name}
              onChange={(e) =>
                setState((s) => ({ ...s, name: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nº de aulas</Label>
              <Input
                type="number"
                min={1}
                value={state.total_classes}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    total_classes: parseInt(e.target.value) || 1,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={state.price ?? ""}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    price: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (resumo curto)</Label>
            <Textarea
              rows={2}
              value={state.description ?? ""}
              onChange={(e) =>
                setState((s) => ({ ...s, description: e.target.value || null }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ementa (conteúdo programático)</Label>
            <Textarea
              rows={5}
              placeholder="Aula 1: ...&#10;Aula 2: ...&#10;Aula 3: ..."
              value={state.syllabus ?? ""}
              onChange={(e) =>
                setState((s) => ({ ...s, syllabus: e.target.value || null }))
              }
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.active === 1}
              onChange={(e) =>
                setState((s) => ({ ...s, active: e.target.checked ? 1 : 0 }))
              }
              className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
            />
            Disponível para venda
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {pkg ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
