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
import { toast } from "@/components/ui/toaster";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";
import { FanFields } from "./FanFields";
import { createFan, listFanNames, recomputeIndicators, updateFan } from "../api";
import { type Fan, type FanCreateInput } from "../types";

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
  indicated_by_fan_id: null,
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
    indicated_by_fan_id: f.indicated_by_fan_id,
    origem: f.origem,
  };
}

export function FanForm({ open, onOpenChange, fan, onSaved }: Props) {
  const [state, setStateRaw] = useState<FanCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [fanOptions, setFanOptions] = useState<{ id: number; name: string }[]>([]);
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
    void listFanNames().then(setFanOptions).catch(() => {});
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
      // Crédito de Indicação: recalcula o nível do indicador (novo e, se editando,
      // o anterior) pra refletir o crédito no ato.
      await recomputeIndicators([fan?.indicated_by_fan_id, state.indicated_by_fan_id]);
      toast.success(fan ? "Fã atualizado" : "Fã criado");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // "Indicado por:" não lista o próprio fã (ao editar).
  const options = fan ? fanOptions.filter((f) => f.id !== fan.id) : fanOptions;

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
            fanOptions={options}
            nameError={nameError}
            clearNameError={() => setNameError(null)}
          />
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
