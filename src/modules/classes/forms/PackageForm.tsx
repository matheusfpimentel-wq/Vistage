import { useEffect, useState } from "react";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
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

/** Lê minutos (inteiros) e converte para horas decimais armazenadas no item. */
function minutesToHours(val: string): number | null {
  const v = val.replace(",", ".").trim();
  if (!v) return null;
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) return null;
  return n / 60;
}

/** Converte horas decimais do item de volta para minutos inteiros para exibição. */
function hoursToMinutesStr(hours: number | null): string {
  if (hours == null) return "";
  return String(Math.round(hours * 60));
}

/** Soma a carga (em horas) de todos os itens da ementa. */
function sumItemHours(items: SyllabusItem[]): number {
  return items.reduce((acc, it) => acc + (it.hours ?? 0), 0);
}

/** Formata horas decimais como "Xh Ymin" amigável. */
function fmtHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function PackageForm({ open, onOpenChange, pkg, onSaved }: Props) {
  const [state, setState] = useState<ClassPackageCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
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

  /** Reordena a ementa movendo o item `from` para a posição `to`. */
  function moveItem(from: number, to: number) {
    if (from === to) return;
    setState((s) => {
      const items = [...s.syllabus_items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...s, syllabus_items: items };
    });
    setDirty(true);
  }

  const totalHours = sumItemHours(state.syllabus_items);

  async function handleSubmit() {
    if (!state.name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    const cleanItems = state.syllabus_items
      .map((it) => ({
        title: it.title.trim(),
        hours: it.hours,
        detail: it.detail && it.detail.trim() ? it.detail.trim() : null,
      }))
      .filter((it) => it.title.length > 0 || it.hours != null || it.detail);
    const computedTotal = sumItemHours(cleanItems);
    if (computedTotal <= 0) {
      toast.error("Adicione itens à ementa com carga (em minutos)");
      return;
    }
    const payload: ClassPackageCreateInput = {
      ...state,
      total_classes: 0,
      total_hours: computedTotal,
      syllabus_items: cleanItems,
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
              <Label>Carga horária total</Label>
              <div className="flex h-10 max-w-[200px] items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                {totalHours > 0 ? (
                  <span className="font-medium">{fmtHours(totalHours)}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Definida pela ementa
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Calculada automaticamente pela soma da carga dos itens da ementa.
              </p>
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
              Itens estruturados da ementa. Cada item tem título, carga (em
              minutos) e detalhamento. Arraste pela alça para reordenar — a soma
              das cargas define a carga horária total do pacote.
            </p>
            {state.syllabus_items.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhum item ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {state.syllabus_items.map((it, idx) => (
                  <div
                    key={idx}
                    className={`space-y-2 rounded-md border p-3 transition-colors ${
                      overIdx === idx && dragIdx !== null && dragIdx !== idx
                        ? "border-primary bg-primary/5"
                        : ""
                    } ${dragIdx === idx ? "opacity-50" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (overIdx !== idx) setOverIdx(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) moveItem(dragIdx, idx);
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                  >
                    <div className="flex gap-2">
                      <div
                        className="flex cursor-grab items-center pt-6 text-muted-foreground active:cursor-grabbing"
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragEnd={() => {
                          setDragIdx(null);
                          setOverIdx(null);
                        }}
                        aria-label="Arrastar para reordenar"
                        title="Arrastar para reordenar"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">Título</Label>
                        <Input
                          placeholder="Ex: Beatmatching"
                          value={it.title}
                          onChange={(e) => updateItem(idx, { title: e.target.value })}
                        />
                      </div>
                      <div className="w-28 space-y-1.5">
                        <Label className="text-xs">Carga (min)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            step={5}
                            placeholder="Ex: 120"
                            value={hoursToMinutesStr(it.hours)}
                            onChange={(e) =>
                              updateItem(idx, { hours: minutesToHours(e.target.value) })
                            }
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            min
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
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
              {totalHours > 0 && (
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-medium text-foreground">{fmtHours(totalHours)}</span>
                </span>
              )}
            </div>
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
