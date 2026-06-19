import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { loadFanClubConfig, saveFanClubConfig } from "../api";
import {
  FAN_PERK_CATEGORIES,
  type FanClubAction,
  type FanClubPerkTemplate,
  type FanPerkCategory,
} from "../types";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FanClubConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [actions, setActions] = useState<FanClubAction[]>([]);
  const [perks, setPerks] = useState<FanClubPerkTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadFanClubConfig().then((c) => {
      setActions(c.actions);
      setPerks(c.perks);
    });
  }, [open]);

  function setAction(id: string, patch: Partial<FanClubAction>) {
    setActions((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function setPerk(id: string, patch: Partial<FanClubPerkTemplate>) {
    setPerks((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFanClubConfig({
        actions: actions.filter((a) => a.label.trim() && a.titleTemplate.trim()),
        perks: perks.filter((p) => p.name.trim()),
      });
      toast.success("Configuração do clube salva");
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar ações do clube</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Ações rápidas */}
          <section className="space-y-2">
            <div className="text-sm font-semibold">Ações rápidas</div>
            <p className="text-xs text-muted-foreground">
              Botões que aparecem em cada fã (viram tarefa). Use <code>{"{nome}"}</code> para inserir o nome do fã.
            </p>
            <div className="space-y-2">
              {actions.map((a) => (
                <div key={a.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                  <Input
                    placeholder="Rótulo (ex: Reativar fã)"
                    value={a.label}
                    onChange={(e) => setAction(a.id, { label: e.target.value })}
                  />
                  <Input
                    placeholder="Tarefa (ex: Reativar contato com {nome})"
                    value={a.titleTemplate}
                    onChange={(e) => setAction(a.id, { titleTemplate: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover ação"
                    onClick={() => setActions((as) => as.filter((x) => x.id !== a.id))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActions((as) => [...as, { id: uid(), label: "", titleTemplate: "" }])}
            >
              <Plus className="h-4 w-4" /> Nova ação
            </Button>
          </section>

          {/* Catálogo de perks */}
          <section className="space-y-2">
            <div className="text-sm font-semibold">Catálogo de perks / brindes</div>
            <p className="text-xs text-muted-foreground">
              Atalhos para adicionar perks na aba do fã com um clique.
            </p>
            <div className="space-y-2">
              {perks.map((p) => (
                <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                  <Select value={p.category} onValueChange={(v) => setPerk(p.id, { category: v as FanPerkCategory })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FAN_PERK_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Perk (ex: Vinil autografado)"
                    value={p.name}
                    onChange={(e) => setPerk(p.id, { name: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover perk"
                    onClick={() => setPerks((ps) => ps.filter((x) => x.id !== p.id))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPerks((ps) => [...ps, { id: uid(), category: "Brinde", name: "" }])}
            >
              <Plus className="h-4 w-4" /> Novo perk
            </Button>
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
