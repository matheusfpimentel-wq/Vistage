import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { toast } from "@/components/ui/toaster";
import { createVenue, updateVenue } from "../api";
import type { Venue, VenueCreateInput } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue?: Venue | null;
  onSaved: (id: number) => void;
};

const EMPTY: VenueCreateInput = {
  name: "",
  city: null,
  state: null,
  country: null,
  address: null,
  founded_year: null,
  capacity: null,
  owner_name: null,
  owner_phone: null,
  owner_email: null,
  instagram: null,
  website: null,
  notes: null,
};

function venueToState(v: Venue): VenueCreateInput {
  return {
    name: v.name,
    city: v.city,
    state: v.state,
    country: v.country,
    address: v.address,
    founded_year: v.founded_year,
    capacity: v.capacity,
    owner_name: v.owner_name,
    owner_phone: v.owner_phone,
    owner_email: v.owner_email,
    instagram: v.instagram,
    website: v.website,
    notes: v.notes,
  };
}

export function VenueForm({ open, onOpenChange, venue, onSaved }: Props) {
  const [state, setState] = useState<VenueCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (venue) setState(venueToState(venue));
    else setState(EMPTY);
    setNameError(null);
  }, [venue, open]);

  function set<K extends keyof VenueCreateInput>(
    key: K,
    value: VenueCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function handleSubmit() {
    if (!state.name.trim()) {
      setNameError("Obrigatório");
      toast.error("O nome do venue é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const id = venue
        ? (await updateVenue({ id: venue.id, ...state }), venue.id)
        : await createVenue(state);
      toast.success(venue ? "Venue atualizado" : "Venue criado");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{venue ? "Editar venue" : "Novo venue"}</DialogTitle>
          <DialogDescription>
            Cadastre uma vez e reutilize em todas as GIGs nessa casa — os
            dados vão automaticamente pro formulário da GIG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Nome" required error={nameError ?? undefined}>
            <Input
              value={state.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (nameError) setNameError(null);
              }}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Cidade">
              <Input
                value={state.city ?? ""}
                onChange={(e) => set("city", e.target.value || null)}
              />
            </Field>
            <Field label="Estado / UF">
              <Input
                value={state.state ?? ""}
                onChange={(e) => set("state", e.target.value || null)}
              />
            </Field>
            <Field label="País">
              <Input
                value={state.country ?? ""}
                onChange={(e) => set("country", e.target.value || null)}
              />
            </Field>
          </div>

          <Field label="Endereço completo">
            <Input
              value={state.address ?? ""}
              onChange={(e) => set("address", e.target.value || null)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ano de fundação">
              <Input
                type="number"
                min={1800}
                max={2100}
                value={state.founded_year ?? ""}
                onChange={(e) =>
                  set("founded_year", e.target.value ? Number(e.target.value) : null)
                }
              />
            </Field>
            <Field label="Capacidade (pessoas)">
              <Input
                type="number"
                min={0}
                value={state.capacity ?? ""}
                onChange={(e) =>
                  set("capacity", e.target.value ? Number(e.target.value) : null)
                }
              />
            </Field>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dono / Operação
            </div>
            <Field label="Nome do dono / responsável">
              <Input
                value={state.owner_name ?? ""}
                onChange={(e) => set("owner_name", e.target.value || null)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Telefone do dono">
                <Input
                  value={state.owner_phone ?? ""}
                  onChange={(e) => set("owner_phone", e.target.value || null)}
                />
              </Field>
              <Field label="Email do dono">
                <Input
                  type="email"
                  value={state.owner_email ?? ""}
                  onChange={(e) => set("owner_email", e.target.value || null)}
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Instagram">
              <Input
                placeholder="@venue"
                value={state.instagram ?? ""}
                onChange={(e) => set("instagram", e.target.value || null)}
              />
            </Field>
            <Field label="Site">
              <Input
                placeholder="https://"
                value={state.website ?? ""}
                onChange={(e) => set("website", e.target.value || null)}
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              rows={3}
              value={state.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
              placeholder="Equipamento padrão, política de pagamento, dress code…"
            />
          </Field>
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
            {venue ? "Salvar alterações" : "Criar venue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
