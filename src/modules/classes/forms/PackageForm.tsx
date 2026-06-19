import { useEffect, useState } from "react";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type SyllabusRowProps = {
  id: string;
  idx: number;
  it: SyllabusItem;
  updateItem: (idx: number, patch: Partial<SyllabusItem>) => void;
  removeItem: (idx: number) => void;
};

function SyllabusRow({ id, idx, it, updateItem, removeItem }: SyllabusRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="space-y-2 rounded-md border p-3 transition-colors select-none bg-card"
    >
      <div className="flex gap-2">
        <div
          className="flex cursor-grab touch-none items-center pt-6 text-muted-foreground"
          title="Arrastar para reordenar"
          {...attributes}
          {...listeners}
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
  );
}

export function PackageForm({ open, onOpenChange, pkg, onSaved }: Props) {
  const [state, setState] = useState<ClassPackageCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  const sensors = useSensors(useSensor(PointerSensor));

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setState((s) => {
      const ids = s.syllabus_items.map((_, i) => String(i));
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return s;
      return {
        ...s,
        syllabus_items: arrayMove(s.syllabus_items, oldIndex, newIndex),
      };
    });
    setDirty(true);
  }

  const totalHours = sumItemHours(state.syllabus_items);

  // Stable ids based on current index (list is re-initialized on open)
  const sortableIds = state.syllabus_items.map((_, i) => String(i));

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
            {state.syllabus_items.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhum item ainda.
              </div>
            ) : (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={sortableIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {state.syllabus_items.map((it, idx) => (
                      <SyllabusRow
                        key={idx}
                        id={String(idx)}
                        idx={idx}
                        it={it}
                        updateItem={updateItem}
                        removeItem={removeItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
