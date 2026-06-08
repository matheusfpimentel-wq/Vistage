import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { createPackage, updatePackage } from "../api";
import type {
  ClassPackage,
  ClassPackageCreateInput,
  SyllabusItem,
} from "../types";
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg?: ClassPackage | null;
  onSaved: () => void;
};

const EMPTY: ClassPackageCreateInput = {
  name: "",
  total_classes: 0,
  total_hours: null,
  price: null,
  description: null,
  syllabus: null,
  syllabus_items: [],
  active: 1,
};

function parseHours(val: string): number | null {
  const v = val.replace(",", ".");
  if (!v.trim()) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function PackageForm({ open, onOpenChange, pkg, onSaved }: Props) {
  const [state, setState] = useState<ClassPackageCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  useEffect(() => {
    if (pkg) {
      setState({
        name: pkg.name,
        total_classes: 0,
        total_hours: pkg.total_hours,
        price: pkg.price,
        description: pkg.description,
        syllabus: pkg.syllabus,
        syllabus_items: pkg.syllabus_items ?? [],
        active: pkg.active,
      });
    } else {
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

  function updateItem(idx: number, patch: Partial<SyllabusItem>) {
    setState((s) => ({
      ...s,
      syllabus_items: s.syllabus_items.map((it, i) =>
        i === idx ? { ...it, ...patch } : it
      ),
    }));
    setDirty(true);
  }

  function addItem() {
    setState((s) => ({
      ...s,
      syllabus_items: [...s.syllabus_items, { title: "", hours: null, detail: null }],
    }));
    setDirty(true);
  }

  function removeItem(idx: number) {
    setState((s) => ({
      ...s,
      syllabus_items: s.syllabus_items.filter((_, i) => i !== idx),
    }));
    setDirty(true);
  }

  async function handleSubmit() {
    if (!state.name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    if (!state.total_hours || state.total_hours <= 0) {
      toast.error("Informe a carga horária total");
      return;
    }
    const payload: ClassPackageCreateInput = {
      ...state,
      total_classes: 0,
      syllabus_items: state.syllabus_items
        .map((it) => ({
          title: it.title.trim(),
          hours: it.hours,
          detail: it.detail && it.detail.trim() ? it.detail.trim() : null,
        }))
        .filter((it) => it.title.length > 0 || it.hours != null || it.detail),
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
            Template reutilizável baseado em carga horária. Ao vincular para um
            aluno, é gerada uma instância com o saldo e status Ativo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados do pacote</TabsTrigger>
            <TabsTrigger value="ementa">Ementa detalhada</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                placeholder='Ex: "Pacote 10h" ou "Mentoria 7,5h"'
                value={state.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Carga horária total <span className="text-destructive">*</span>
              </Label>
              <div className="relative max-w-[160px]">
                <Input
                  placeholder="Ex: 10"
                  value={
                    state.total_hours != null
                      ? String(state.total_hours).replace(".", ",")
                      : ""
                  }
                  onChange={(e) => set("total_hours", parseHours(e.target.value))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  h
                </span>
              </div>
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

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.active === 1}
                onChange={(e) => set("active", e.target.checked ? 1 : 0)}
                className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
              />
              Disponível para venda
            </label>
          </TabsContent>

          <TabsContent value="ementa" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Itens estruturados da ementa. Cada item tem título, carga horária e
              detalhamento.
            </p>
            {state.syllabus_items.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhum item ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {state.syllabus_items.map((it, idx) => (
                  <div key={idx} className="space-y-2 rounded-md border p-3">
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">Título</Label>
                        <Input
                          placeholder="Ex: Beatmatching"
                          value={it.title}
                          onChange={(e) => updateItem(idx, { title: e.target.value })}
                        />
                      </div>
                      <div className="w-28 space-y-1.5">
                        <Label className="text-xs">Carga (h)</Label>
                        <div className="relative">
                          <Input
                            placeholder="Ex: 2"
                            value={
                              it.hours != null
                                ? String(it.hours).replace(".", ",")
                                : ""
                            }
                            onChange={(e) =>
                              updateItem(idx, { hours: parseHours(e.target.value) })
                            }
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            h
                          </span>
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Remover item"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Detalhamento</Label>
                      <Textarea
                        rows={2}
                        value={it.detail ?? ""}
                        onChange={(e) =>
                          updateItem(idx, { detail: e.target.value || null })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" /> Adicionar item
            </Button>
          </TabsContent>
        </Tabs>

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
