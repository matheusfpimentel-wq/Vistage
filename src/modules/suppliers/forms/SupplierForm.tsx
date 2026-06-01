import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  createService,
  createSupplier,
  deleteService,
  listServices,
  updateService,
  updateSupplier,
} from "../api";
import { SUPPLIER_CATEGORIES } from "../types";
import type { Supplier, SupplierService } from "../types";

type ServiceRow = {
  id?: number;
  description: string;
  unit: string;
  price: string;
  notes: string;
  _delete?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved: () => void;
};

export function SupplierForm({ open, onOpenChange, supplier, onSaved }: Props) {
  const isEdit = !!supplier;

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && supplier) {
      setName(supplier.name);
      setCategory(supplier.category ?? "");
      setContactName(supplier.contact_name ?? "");
      setPhone(supplier.phone ?? "");
      setEmail(supplier.email ?? "");
      setInstagram(supplier.instagram ?? "");
      setCity(supplier.city ?? "");
      setNotes(supplier.notes ?? "");
      setRating(supplier.rating ?? 0);
      listServices(supplier.id).then((svcs) => {
        setServices(
          svcs.map((s) => ({
            id: s.id,
            description: s.description,
            unit: s.unit ?? "",
            price: s.price != null ? String(s.price) : "",
            notes: s.notes ?? "",
          }))
        );
      });
    } else if (open && !supplier) {
      setName("");
      setCategory("");
      setContactName("");
      setPhone("");
      setEmail("");
      setInstagram("");
      setCity("");
      setNotes("");
      setRating(0);
      setServices([]);
    }
  }, [open, supplier]);

  function addServiceRow() {
    setServices((prev) => [
      ...prev,
      { description: "", unit: "", price: "", notes: "" },
    ]);
  }

  function updateRow(idx: number, field: keyof ServiceRow, value: string) {
    setServices((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  function markDelete(idx: number) {
    setServices((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, _delete: true } : r))
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category: (category || null) as Supplier["category"],
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        instagram: instagram.trim() || null,
        city: city.trim() || null,
        notes: notes.trim() || null,
        rating: rating > 0 ? rating : null,
      };

      let supplierId: number;
      if (isEdit && supplier) {
        await updateSupplier({ id: supplier.id, ...payload });
        supplierId = supplier.id;
      } else {
        supplierId = await createSupplier(payload);
      }

      // Sync services
      for (const [idx, row] of services.entries()) {
        if (row._delete) {
          if (row.id) await deleteService(row.id);
          continue;
        }
        if (!row.description.trim()) continue;
        const svcData = {
          description: row.description.trim(),
          unit: row.unit.trim() || null,
          price: row.price ? parseFloat(row.price) : null,
          notes: row.notes.trim() || null,
        };
        if (row.id) {
          await updateService(row.id, svcData);
        } else {
          await createService(supplierId, svcData);
        }
        void idx; // suppress unused warning
      }

      toast.success(isEdit ? "Fornecedor atualizado" : "Fornecedor criado");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const visibleServices = services.filter((r) => !r._delete);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sup-name">Nome *</Label>
              <Input
                id="sup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem categoria</SelectItem>
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sup-contact">Contato</Label>
              <Input
                id="sup-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input
                id="sup-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sup-email">E-mail</Label>
              <Input
                id="sup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@fornecedor.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sup-instagram">Instagram</Label>
              <Input
                id="sup-instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@handle"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sup-city">Cidade</Label>
              <Input
                id="sup-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="São Paulo"
              />
            </div>
            <div className="space-y-1">
              <Label>Avaliação</Label>
              <div className="flex items-center gap-1 pt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star === rating ? 0 : star)}
                    className="text-muted-foreground transition hover:text-yellow-400"
                  >
                    <Star
                      className={cn(
                        "h-5 w-5",
                        star <= rating ? "fill-yellow-400 text-yellow-400" : ""
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sup-notes">Notas</Label>
            <textarea
              id="sup-notes"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações sobre o fornecedor..."
            />
          </div>

          {/* Services */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Serviços / tabela de preços</Label>
              <Button type="button" size="sm" variant="outline" onClick={addServiceRow}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {visibleServices.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado.</p>
            )}
            {services.map((row, idx) => {
              if (row._delete) return null;
              return (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <Input
                    placeholder="Descrição do serviço"
                    value={row.description}
                    onChange={(e) => updateRow(idx, "description", e.target.value)}
                  />
                  <Input
                    className="w-24"
                    placeholder="Unidade"
                    value={row.unit}
                    onChange={(e) => updateRow(idx, "unit", e.target.value)}
                  />
                  <Input
                    className="w-28"
                    placeholder="Preço"
                    type="number"
                    value={row.price}
                    onChange={(e) => updateRow(idx, "price", e.target.value)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => markDelete(idx)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
