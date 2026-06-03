import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { AttachmentField } from "@/components/shared/AttachmentField";
import { useUnsavedConfirm } from "@/lib/dirty";
import { createVenue, updateVenue } from "../api";
import type { Venue, VenueCreateInput } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue?: Venue | null;
  onSaved: (id: number) => void;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country_code?: string;
  };
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
  owner_role: null,
  owner_phone: null,
  owner_email: null,
  instagram: null,
  website: null,
  notes: null,
  photo_path: null,
  lat: null,
  lng: null,
  geocoded_at: null,
  concept: null,
  dominant_genre: null,
  rider_equipment: null,
  regular_audience: null,
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
    owner_role: v.owner_role,
    owner_phone: v.owner_phone,
    owner_email: v.owner_email,
    instagram: v.instagram,
    website: v.website,
    notes: v.notes,
    photo_path: v.photo_path,
    lat: v.lat,
    lng: v.lng,
    geocoded_at: v.geocoded_at,
    concept: v.concept,
    dominant_genre: v.dominant_genre,
    rider_equipment: v.rider_equipment ?? null,
    regular_audience: v.regular_audience,
  };
}

export function VenueForm({ open, onOpenChange, venue, onSaved }: Props) {
  const [state, setState] = useState<VenueCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (venue) setState(venueToState(venue));
    else setState(EMPTY);
    setNameError(null);
    setDirty(false);
    setSuggestions([]);
    setShowSuggestions(false);
  }, [venue, open]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        addressContainerRef.current &&
        !addressContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function set<K extends keyof VenueCreateInput>(
    key: K,
    value: VenueCreateInput[K]
  ) {
    setDirty(true);
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleAddressChange(value: string) {
    set("address", value || null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(value)}&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Vistage/1.0" },
        });
        if (!res.ok) return;
        const data: NominatimResult[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        // silently ignore network errors
      }
    }, 600);
  }

  function applySuggestion(s: NominatimResult) {
    const city =
      s.address.city ?? s.address.town ?? s.address.village ?? null;
    const stateVal = s.address.state ?? null;
    const country = s.address.country_code
      ? s.address.country_code.toUpperCase()
      : null;
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setDirty(true);
    setState((prev) => ({
      ...prev,
      address: s.display_name,
      city: city ?? prev.city,
      state: stateVal ?? prev.state,
      country: country ?? prev.country,
      lat,
      lng,
      geocoded_at: new Date().toISOString(),
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function clearCoordinates() {
    setDirty(true);
    setState((s) => ({ ...s, lat: null, lng: null, geocoded_at: null }));
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
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{venue ? "Editar venue" : "Novo venue"}</DialogTitle>
          <DialogDescription>
            Cadastre uma vez e reutilize em todas as GIGs nessa casa — os
            dados vão automaticamente pro formulário da GIG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AttachmentField
            label="Foto de apresentação"
            value={state.photo_path}
            onChange={(v) => set("photo_path", v)}
            subdir="venues"
            variant="image"
          />

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

          <div ref={addressContainerRef} className="relative">
            <Field label="Endereço completo">
              <Input
                value={state.address ?? ""}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                autoComplete="off"
              />
            </Field>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                {suggestions.map((s) => (
                  <div
                    key={s.place_id}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={(e) => {
                      // prevent blur from firing before click
                      e.preventDefault();
                      applySuggestion(s);
                    }}
                  >
                    {s.display_name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Geolocalização */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Geolocalização
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Latitude">
                <Input
                  type="number"
                  step="any"
                  placeholder="ex: -23.5505"
                  value={state.lat ?? ""}
                  onChange={(e) =>
                    set("lat", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
              <Field label="Longitude">
                <Input
                  type="number"
                  step="any"
                  placeholder="ex: -46.6333"
                  value={state.lng ?? ""}
                  onChange={(e) =>
                    set("lng", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearCoordinates}
              disabled={state.lat == null && state.lng == null}
            >
              Limpar coordenadas
            </Button>
          </div>

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

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Identidade do Espaço
            </div>
            <Field label="Conceito do espaço">
              <Textarea
                rows={2}
                placeholder="Ex: underground techno, intimista, industrial…"
                value={state.concept ?? ""}
                onChange={(e) => set("concept", e.target.value || null)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Gênero musical dominante">
                <Input
                  placeholder="Ex: Techno, House, Drum & Bass"
                  value={state.dominant_genre ?? ""}
                  onChange={(e) => set("dominant_genre", e.target.value || null)}
                />
              </Field>
              <Field label="Público habitual">
                <Input
                  placeholder="Ex: 200–400 pessoas, 25–35 anos"
                  value={state.regular_audience ?? ""}
                  onChange={(e) => set("regular_audience", e.target.value || null)}
                />
              </Field>
            </div>
            <Field label="Rider técnico disponível">
              <Textarea
                placeholder="Equipamento disponível na casa: PA, mesa, monitores, microfones, backline…"
                value={state.rider_equipment ?? ""}
                onChange={(e) => set("rider_equipment", e.target.value || null)}
                rows={3}
              />
            </Field>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contato responsável
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <Input
                  value={state.owner_name ?? ""}
                  onChange={(e) => set("owner_name", e.target.value || null)}
                  placeholder="Nome do responsável"
                />
              </Field>
              <Field label="Cargo">
                <Select
                  value={state.owner_role ?? ""}
                  onValueChange={(v) => set("owner_role", v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gerente">Gerente</SelectItem>
                    <SelectItem value="Dono">Dono</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Telefone">
                <Input
                  value={state.owner_phone ?? ""}
                  onChange={(e) => set("owner_phone", e.target.value || null)}
                />
              </Field>
              <Field label="Email">
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
