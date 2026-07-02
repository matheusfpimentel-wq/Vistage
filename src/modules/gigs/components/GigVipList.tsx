import { useEffect, useState } from "react";
import { ClipboardCopy, Pencil, Plus, Trash2, Check, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { EMPTY_VALUE } from "@/lib/format";
import {
  addFanListMember,
  createFanList,
  deleteFanList,
  importVipListAsFans,
  listFanListMembers,
  listFanListsForGig,
  listFans,
  removeFanListMember,
  updateFanList,
} from "@/modules/fans/api";
import type { Fan, FanList, FanListMember } from "@/modules/fans/types";

/**
 * Lista VIP / Cortesias de UMA GIG (aba Preparação). Reaproveita o padrão do
 * FanListsPanel do Clube de Fãs, mas escopado por gig_id: cria/renomeia/exclui
 * listas, adiciona membros (fã via dropdown OU nome livre), remove e "Copiar
 * texto". As listas aqui já nascem ligadas a esta GIG.
 */
export function GigVipList({ gigId, gigName }: { gigId: number; gigName: string }) {
  const [lists, setLists] = useState<FanList[]>([]);
  const [fans, setFans] = useState<Fan[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, FanListMember[]>>({});
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [memberInput, setMemberInput] = useState<Record<number, { fanId: string; name: string }>>({});
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    void refresh();
    void listFans().then(setFans).catch(() => {});
  }, [gigId]);

  async function refresh() {
    setLists(await listFanListsForGig(gigId));
  }

  async function expand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    const rows = await listFanListMembers(id);
    setMembers((prev) => ({ ...prev, [id]: rows }));
  }

  async function handleAddList() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await createFanList({ name: newName.trim(), gig_id: gigId, notes: null });
      setNewName("");
      await refresh();
      toast.success("Lista criada");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteList(id: number) {
    if (
      !(await confirmDialog({
        title: "Excluir lista",
        description: "Excluir esta lista?",
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteFanList(id);
    if (expandedId === id) setExpandedId(null);
    await refresh();
  }

  function startRename(list: FanList) {
    setRenamingId(list.id);
    setRenameValue(list.name);
    // Editar = renomear E gerir pessoas: abre a lista (membros + adicionar/remover)
    // se ainda não estiver aberta, pra o lápis dar acesso direto a tudo.
    if (expandedId !== list.id) {
      setExpandedId(list.id);
      void listFanListMembers(list.id)
        .then((rows) => setMembers((prev) => ({ ...prev, [list.id]: rows })))
        .catch(() => {});
    }
  }

  async function commitRename(id: number) {
    const name = renameValue.trim();
    if (name) {
      await updateFanList({ id, name });
      await refresh();
    }
    setRenamingId(null);
    setRenameValue("");
  }

  async function handleAddMember(listId: number) {
    const inp = memberInput[listId];
    const fanId = inp?.fanId ? Number(inp.fanId) : null;
    const name = inp?.name?.trim() || null;
    if (!fanId && !name) return;
    await addFanListMember(listId, fanId, fanId ? null : name);
    const rows = await listFanListMembers(listId);
    setMembers((prev) => ({ ...prev, [listId]: rows }));
    setMemberInput((prev) => ({ ...prev, [listId]: { fanId: "", name: "" } }));
  }

  async function handleRemoveMember(listId: number, memberId: number) {
    await removeFanListMember(memberId);
    setMembers((prev) => ({
      ...prev,
      [listId]: prev[listId]?.filter((m) => m.id !== memberId) ?? [],
    }));
  }

  function memberName(m: FanListMember): string {
    if (m.fan_id) return fans.find((f) => f.id === m.fan_id)?.name ?? m.name ?? EMPTY_VALUE;
    return m.name ?? EMPTY_VALUE;
  }

  async function handleImport(list: FanList) {
    const ms = members[list.id] ?? (await listFanListMembers(list.id));
    const total = ms.length;
    if (total === 0) {
      toast.error("Esta lista não tem nomes para importar.");
      return;
    }
    if (
      !(await confirmDialog({
        title: "Importar como fãs",
        description: `Importar os ${total} ${total === 1 ? "nome" : "nomes"} desta lista como fãs do Clube de Fãs, marcando presença nesta GIG?`,
        confirmLabel: "Importar",
      }))
    )
      return;
    setImportingId(list.id);
    try {
      const r = await importVipListAsFans(list.id, { id: gigId, name: gigName });
      const parts: string[] = [];
      if (r.created > 0) parts.push(`${r.created} ${r.created === 1 ? "novo fã" : "novos fãs"}`);
      if (r.linked > 0) parts.push(`${r.linked} ${r.linked === 1 ? "vinculado" : "vinculados"}`);
      if (r.alreadyFans > 0) parts.push(`${r.alreadyFans} já ${r.alreadyFans === 1 ? "era fã" : "eram fãs"}`);
      const resumo = parts.length > 0 ? parts.join(", ") : "nada a importar";
      toast.success(`Presença marcada: ${resumo}`);
      // reflete fãs criados/vinculados na UI (dropdown + nomes da lista)
      void listFans().then(setFans).catch(() => {});
      const rows = await listFanListMembers(list.id);
      setMembers((prev) => ({ ...prev, [list.id]: rows }));
    } finally {
      setImportingId(null);
    }
  }

  async function copyList(list: FanList) {
    const ms = members[list.id] ?? (await listFanListMembers(list.id));
    const lines: string[] = [`🎟️ ${list.name}`, ""];
    ms.forEach((m, i) => lines.push(`${i + 1}. ${memberName(m)}`));
    lines.push("", `Total: ${ms.length} ${ms.length === 1 ? "nome" : "nomes"}`);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lista VIP copiada");
    } catch {
      toast.error("Não consegui copiar. Texto:\n" + text);
    }
  }

  return (
    <div className="space-y-4">
      {lists.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma lista ainda.</p>
      )}

      {lists.map((list) => {
        const ms = members[list.id] ?? [];
        return (
          <div key={list.id} className="rounded-md border">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              {renamingId === list.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    className="h-7 flex-1 text-sm"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(list.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-6"
                    onClick={() => void commitRename(list.id)}
                    aria-label="Confirmar"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-6"
                    onClick={() => {
                      setRenamingId(null);
                      setRenameValue("");
                    }}
                    aria-label="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left text-sm font-medium"
                  onClick={() => void expand(list.id)}
                >
                  {list.name}
                </button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void handleImport(list)}
                disabled={importingId === list.id}
                title="Trazer estes nomes como fãs do Clube de Fãs, marcando presença nesta GIG"
              >
                <UserPlus className="h-3.5 w-3.5" /> Importar como fãs
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => void copyList(list)}>
                <ClipboardCopy className="h-3.5 w-3.5" /> Copiar texto
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-6"
                onClick={() => startRename(list)}
                aria-label="Editar (renomear e gerir pessoas)"
                title="Editar: renomear e adicionar/remover pessoas"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-6 text-destructive"
                onClick={() => void handleDeleteList(list.id)}
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {expandedId === list.id && (
              <div className="space-y-2 border-t px-3 py-3">
                {ms.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem nomes ainda.</p>
                )}
                {ms.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span>{memberName(m)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => void handleRemoveMember(list.id, m.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <select
                    className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                    value={memberInput[list.id]?.fanId ?? ""}
                    onChange={(e) =>
                      setMemberInput((prev) => ({
                        ...prev,
                        [list.id]: { fanId: e.target.value, name: prev[list.id]?.name ?? "" },
                      }))
                    }
                  >
                    <option value="">Selecionar fã…</option>
                    {fans.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="h-8 flex-1 text-xs"
                    placeholder="Ou nome livre"
                    value={memberInput[list.id]?.name ?? ""}
                    onChange={(e) =>
                      setMemberInput((prev) => ({
                        ...prev,
                        [list.id]: { name: e.target.value, fanId: prev[list.id]?.fanId ?? "" },
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddMember(list.id);
                    }}
                  />
                  <Button size="sm" className="h-8" onClick={() => void handleAddMember(list.id)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="space-y-2 rounded-md border p-3">
        <div className="text-xs font-medium text-muted-foreground">Nova lista</div>
        <div className="flex gap-2">
          <Input
            placeholder="Nome da lista * (ex.: VIP, Cortesias)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddList();
            }}
          />
          <Button size="sm" onClick={() => void handleAddList()} disabled={adding}>
            <Plus className="h-3.5 w-3.5" /> Criar lista
          </Button>
        </div>
      </div>
    </div>
  );
}
