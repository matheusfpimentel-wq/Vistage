import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";
import { FanFields } from "./FanFields";
import { addFanGroupMember, createFan, listFanGroups, updateFan } from "../api";
import { type Fan, type FanCreateInput, type FanGroup } from "../types";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fan?: Fan | null;
  onSaved: (id: number) => void;
};

const EMPTY: FanCreateInput = {
  name: "",
  level: "Possível fã",
  is_ambassador: 0,
  instagram: null,
  email: null,
  phone: null,
  city: null,
  tags: [],
  notes: null,
  photo_path: null,
  contact_id: null,
  origem: null,
};

function fanToState(f: Fan): FanCreateInput {
  return {
    name: f.name,
    level: f.level,
    is_ambassador: f.is_ambassador,
    instagram: f.instagram,
    email: f.email,
    phone: f.phone,
    city: f.city,
    tags: f.tags,
    notes: f.notes,
    photo_path: f.photo_path,
    contact_id: f.contact_id,
    origem: f.origem,
  };
}

export function FanForm({ open, onOpenChange, fan, onSaved }: Props) {
  const [state, setStateRaw] = useState<FanCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [groups, setGroups] = useState<FanGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const confirmClose = useUnsavedConfirm(dirty);

  const setState: typeof setStateRaw = (v) => {
    setStateRaw(v);
    setDirty(true);
  };

  useEffect(() => {
    if (!open) return;
    if (fan) setStateRaw(fanToState(fan));
    else setStateRaw(EMPTY);
    setNameError(null);
    setDirty(false);
    setSelectedGroupId(null);
    void listFanGroups().then(setGroups).catch(() => {});
    void listContacts().then(setContacts).catch(() => {});
  }, [fan, open]);

  async function handleSubmit() {
    if (!state.name.trim()) {
      setNameError("Obrigatório");
      toast.error("O nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const id = fan
        ? (await updateFan({ id: fan.id, ...state }), fan.id)
        : await createFan(state);
      if (!fan && selectedGroupId) {
        await addFanGroupMember(selectedGroupId, id, state.name, null).catch(() => {});
      }
      toast.success(fan ? "Fã atualizado" : "Fã criado");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-xl" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>{fan ? "Editar fã" : "Novo fã"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FanFields
            state={state}
            setState={setState}
            contacts={contacts}
            nameError={nameError}
            clearNameError={() => setNameError(null)}
          />

          {!fan && groups.length > 0 && (
            <div className="space-y-1.5">
              <Label>Adicionar ao grupo</Label>
              <Select
                value={selectedGroupId != null ? String(selectedGroupId) : "none"}
                onValueChange={(v) => setSelectedGroupId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum grupo</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {fan ? "Salvar alterações" : "Criar fã"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
