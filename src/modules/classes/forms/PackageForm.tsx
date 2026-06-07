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
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg?: ClassPackage | null;
  onSaved: () => void;
};

const EMPTY: ClassPackageCreateInput = {
  name: "",
  total_classes: 4,
  total_hours: null,
  price: null,
  description: null,
  syllabus: null,
  active: 1,
};

export function PackageForm({ open, onOpenChange, pkg, onSaved }: Props) {
  const [state, setState] = useState<ClassPackageCreateInput>(EMPTY);
  const [useHours, setUseHours] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (pkg) {
      const byHours = pkg.total_hours != null;
      setUseHours(byHours);
      setState({
        name: pkg.name,
        total_classes: pkg.total_classes,
        total_hours: pkg.total_hours,
        price: pkg.price,
        description: pkg.description,
        syllabus: pkg.syllabus,
        active: pkg.active,
      });
    } else {
      setUseHours(false);
      setState(EMPTY);
    }
    setDirty(false);
  }, [pkg, open]);

  function set<K extends keyof ClassPackageCreateInput>(
    key: K,
    value: ClassPackageCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  async function handleSubmit() {
    if (!state.name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    if (useHours && (!state.total_hours || state.total_hours <= 0)) {
      toast.error("Informe a carga horária total");
      return;
    }
    if (!useHours && state.total_classes < 1) {
      toast.error("Informe o número de aulas");
      return;
    }
    const payload: ClassPackageCreateInput = {
      ...state,
      total_hours: useHours ? state.total_hours : null,
      total_classes: useHours ? 999 : state.total_classes,
    };
    setSaving(true);
    try {
      if (pkg) await updatePackage({ id: pkg.id, ...payload });
      else await createPackage(payload);
      toast.success(pkg ? "Pacote atualizado" : "Pacote criado");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pkg ? "Editar pacote" : "Novo pacote"}</DialogTitle>
          <DialogDescription>
            Template reutilizável. Ao vender para um aluno, é gerada uma instância
            com o saldo e status Ativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              placeholder='Ex: "Mensal 4 aulas" ou "Pacote 10h"'
              value={state.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Limite de uso</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="limit_type"
                  checked={!useHours}
                  onChange={() => { setUseHours(false); setDirty(true); }}
                  className="accent-primary"
                />
                Nº de aulas
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="limit_type"
                  checked={useHours}
                  onChange={() => { setUseHours(true); setDirty(true); }}
                  className="accent-primary"
                />
                Carga horária total
              </label>
            </div>
            {useHours ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Total de horas</Label>
                <div className="relative max-w-[140px]">
                  <Input
                    placeholder="Ex: 10"
                    value={state.total_hours != null ? String(state.total_hours).replace(".", ",") : ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(",", ".");
                      set("total_hours", v ? parseFloat(v) || null : null);
                    }}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">h</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nº de aulas</Label>
                <Input
                  type="number"
                  min={1}
                  className="max-w-[140px]"
                  value={state.total_classes}
                  onChange={(e) => set("total_classes", parseInt(e.target.value) || 1)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Preço (R$)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              className="max-w-[200px]"
              value={state.price ?? ""}
              onChange={(e) =>
                set("price", e.target.value ? Number(e.target.value) : null)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (resumo curto)</Label>
            <Textarea
              rows={2}
              value={state.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ementa (conteúdo programático)</Label>
            <Textarea
              rows={5}
              placeholder="Aula 1: ...&#10;Aula 2: ...&#10;Aula 3: ..."
              value={state.syllabus ?? ""}
              onChange={(e) => set("syllabus", e.target.value || null)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.active === 1}
              onChange={(e) => set("active", e.target.checked ? 1 : 0)}
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
