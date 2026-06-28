import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCopy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import {
  addFanListMember,
  createFanList,
  deleteFanList,
  listFanListMembers,
  listFanLists,
  removeFanListMember,
} from "../api";
import type { Fan, FanList, FanListMember } from "../types";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import type { Gig } from "@/modules/gigs/types";
import { formatDate } from "@/lib/format";

/**
 * "Listas VIP" — monta uma lista de nomes (ex.: convidados/VIP) opcionalmente
 * ligada a uma GIG e exporta em texto pronto pra enviar.
 */
export function FanListsPanel({ fans, embedded = false }: { fans: Fan[]; embedded?: boolean }) {
  const [open, setOpen] = useState(embedded);
  const [lists, setLists] = useState<FanList[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, FanListMember[]>>({});
  const [newName, setNewName] = useState("");
  const [newGigId, setNewGigId] = useState<string>("none");
  const [adding, setAdding] = useState(false);
  const [memberInput, setMemberInput] = useState<Record<number, { fanId: string; name: string }>>({});

  useEffect(() => {
    if (open) {
      void refresh();
      void listGigs().then(setGigs).catch(() => {});
    }
  }, [open]);

  async function refresh() {
    setLists(await listFanLists());
  }

  function gigLabel(gigId: number | null): string | null {
    if (gigId == null) return null;
    const g = gigs.find((x) => x.id === gigId);
    if (!g) return null;
    return `${gigDisplayName(g)}${g.date ? ` · ${formatDate(g.date)}` : ""}`;
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
      await createFanList({
        name: newName.trim(),
        gig_id: newGigId === "none" ? null : Number(newGigId),
        notes: null,
      });
      setNewName("");
      setNewGigId("none");
      await refresh();
      toast.success("Lista criada");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteList(id: number) {
    if (!(await confirmDialog({ title: "Excluir lista", description: "Excluir esta lista?", confirmLabel: "Excluir", destructive: true }))) return;
    await deleteFanList(id);
    if (expandedId === id) setExpandedId(null);
    await refresh();
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
    setMembers((prev) => ({ ...prev, [listId]: prev[listId]?.filter((m) => m.id !== memberId) ?? [] }));
  }

  function memberName(m: FanListMember): string {
    if (m.fan_id) return fans.find((f) => f.id === m.fan_id)?.name ?? m.name ?? "—";
    return m.name ?? "—";
  }

  async function copyList(list: FanList) {
    const ms = members[list.id] ?? (await listFanListMembers(list.id));
    const lines: string[] = [`🎟️ ${list.name}`];
    const gl = gigLabel(list.gig_id);
    if (gl) lines.push(gl);
    lines.push("");
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
    <div className={embedded ? "" : "rounded-md border"}>
      {!embedded && (
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          onClick={() => setOpen((v) => !v)}
        >
          <span>Listas VIP</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}

      {(embedded || open) && (
        <div className={embedded ? "space-y-4" : "space-y-4 border-t p-4"}>
          {lists.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma lista ainda.</p>
          )}

          {lists.map((list) => {
            const gl = gigLabel(list.gig_id);
            const ms = members[list.id] ?? [];
            return (
              <div key={list.id} className="rounded-md border">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" className="flex-1 text-left text-sm font-medium" onClick={() => void expand(list.id)}>
                    {list.name}
                    {gl && <span className="ml-2 text-xs text-muted-foreground">· {gl}</span>}
                  </button>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => void copyList(list)}>
                    <ClipboardCopy className="h-3.5 w-3.5" /> Copiar texto
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-6 text-destructive" onClick={() => void handleDeleteList(list.id)}>
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
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => void handleRemoveMember(list.id, m.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <select
                        className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
                        value={memberInput[list.id]?.fanId ?? ""}
                        onChange={(e) => setMemberInput((prev) => ({ ...prev, [list.id]: { fanId: e.target.value, name: prev[list.id]?.name ?? "" } }))}
                      >
                        <option value="">Selecionar fã…</option>
                        {fans.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <Input
                        className="h-8 flex-1 text-xs"
                        placeholder="Ou nome livre"
                        value={memberInput[list.id]?.name ?? ""}
                        onChange={(e) => setMemberInput((prev) => ({ ...prev, [list.id]: { name: e.target.value, fanId: prev[list.id]?.fanId ?? "" } }))}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAddMember(list.id); }}
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
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Nome da lista *" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Select value={newGigId} onValueChange={setNewGigId}>
                <SelectTrigger>
                  <SelectValue placeholder="GIG (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem GIG</SelectItem>
                  {gigs.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {gigDisplayName(g)}{g.date ? ` · ${formatDate(g.date)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void handleAddList()} disabled={adding}>
                <Plus className="h-3.5 w-3.5" /> Criar lista
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
