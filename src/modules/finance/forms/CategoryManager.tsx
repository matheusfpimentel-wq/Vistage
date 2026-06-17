import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import {
  countTransactionsForCategory,
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "../api";
import type { FinanceCategory, TransactionKind } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export function CategoryManager({ open, onOpenChange, onChanged }: Props) {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [activeTab, setActiveTab] = useState<TransactionKind>("income");

  async function refresh() {
    setCategories(await listCategories());
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCategory(name, activeTab);
      setNewName("");
      await refresh();
      onChanged();
      toast.success("Categoria criada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleRename(id: number) {
    const name = editName.trim();
    if (!name) return;
    try {
      await renameCategory(id, name);
      setEditing(null);
      setEditName("");
      await refresh();
      onChanged();
      toast.success("Categoria renomeada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleDelete(c: FinanceCategory) {
    const count = await countTransactionsForCategory(c.id);
    const msg =
      count > 0
        ? `"${c.name}" está em uso em ${count} transação(ões). Ao excluir, essas transações ficarão sem categoria. Continuar?`
        : `Excluir a categoria "${c.name}"?`;
    if (!(await confirm({ description: msg }))) return;
    try {
      await deleteCategory(c.id);
      await refresh();
      onChanged();
      toast.success("Categoria excluída");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Categorias financeiras</DialogTitle>
          <DialogDescription>
            Renomeie ou exclua qualquer categoria — as padrão também podem ser
            alteradas livremente.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TransactionKind)}>
          <TabsList>
            <TabsTrigger value="income">Receitas</TabsTrigger>
            <TabsTrigger value="expense">Despesas</TabsTrigger>
          </TabsList>

          {(["income", "expense"] as TransactionKind[]).map((k) => (
            <TabsContent key={k} value={k} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder={`Nova categoria de ${k === "income" ? "receita" : "despesa"}`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreate();
                    }
                  }}
                />
                <Button type="button" onClick={handleCreate}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>

              <div className="space-y-1">
                {categories
                  .filter((c) => c.kind === k)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      {editing === c.id ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleRename(c.id);
                            }
                            if (e.key === "Escape") {
                              setEditing(null);
                              setEditName("");
                            }
                          }}
                          className="flex-1"
                        />
                      ) : (
                        <span className="flex items-center gap-2">
                          {c.name}
                          {c.is_default === 1 && (
                            <Badge variant="outline" className="text-xs">
                              padrão
                            </Badge>
                          )}
                        </span>
                      )}

                      <div className="flex items-center gap-1">
                        {editing === c.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRename(c.id)}
                            >
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(null);
                                setEditName("");
                              }}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditing(c.id);
                                setEditName(c.name);
                              }}
                              aria-label="Renomear"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(c)}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
