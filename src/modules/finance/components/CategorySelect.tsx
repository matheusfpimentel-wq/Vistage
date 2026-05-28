import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { createCategory } from "../api";
import type { FinanceCategory, TransactionKind } from "../types";

type Props = {
  kind: TransactionKind;
  categories: FinanceCategory[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCategoriesChange: () => void;
};

export function CategorySelect({
  kind,
  categories,
  value,
  onChange,
  onCategoriesChange,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await createCategory(name, kind);
      onChange(id);
      onCategoriesChange();
      setCreating(false);
      setNewName("");
      toast.success(`Categoria "${name}" criada`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="Nome da nova categoria"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
            if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
        />
        <Button type="button" variant="outline" onClick={handleCreate}>
          Criar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setCreating(false);
            setNewName("");
          }}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value?.toString() ?? "none"}
      onValueChange={(v) => {
        if (v === "__new") {
          setCreating(true);
          return;
        }
        onChange(v === "none" ? null : Number(v));
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Sem categoria —</SelectItem>
        {categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.name}
            </SelectItem>
          ))}
        <SelectItem value="__new" className="font-medium text-primary">
          <span className="inline-flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Nova categoria…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
