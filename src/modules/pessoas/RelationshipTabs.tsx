import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { updateContact } from "@/modules/crm/api";
import {
  ALVO_ESTAGIOS,
  type Contact,
  type ContactRelationshipType,
  type RelationshipData,
} from "@/modules/crm/types";
import {
  createService,
  deleteService,
  listServices,
} from "@/modules/suppliers/api";
import type { SupplierService } from "@/modules/suppliers/types";
import { formatCurrency } from "@/lib/format";

/** Rótulo da aba de cada tipo de relação. */
export const RELATION_TAB_LABEL: Record<ContactRelationshipType, string> = {
  Contratante: "Contratação",
  Parceiro: "Parceria",
  Alvo: "Prospecção",
  "Músico": "Música",
};

/** Aba de uma relação: edita os campos específicos (relationship_data[type]). */
export function RelationshipTabContent({
  type,
  contact,
  onSaved,
}: {
  type: ContactRelationshipType;
  contact: Contact;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(
    (contact.relationship_data[type] as Record<string, unknown>) ?? {}
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData((contact.relationship_data[type] as Record<string, unknown>) ?? {});
  }, [contact, type]);

  const set = (key: string, value: unknown) =>
    setData((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const next: RelationshipData = {
        ...contact.relationship_data,
        [type]: data,
      };
      await updateContact({ id: contact.id, relationship_data: next });
      toast.success("Salvo");
      onSaved();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pt-2">
      {type === "Contratante" && (
        <>
          <p className="text-xs text-muted-foreground">
            As estatísticas de GIGs (quantas, faturamento, última) aparecem no topo deste perfil.
          </p>
          <div className="space-y-1.5">
            <Label>Cachê de referência (R$)</Label>
            <Input
              type="number"
              min={0}
              placeholder="Ex: 2500"
              value={(data.cacheReferencia as number | undefined) ?? ""}
              onChange={(e) => set("cacheReferencia", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </>
      )}

      {type === "Parceiro" && (
        <>
          <div className="space-y-1.5">
            <Label>Tipo de parceria</Label>
            <Input
              placeholder="Selo, coletivo, produção, B2B…"
              value={(data.tipo as string | undefined) ?? ""}
              onChange={(e) => set("tipo", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Projetos / colaborações</Label>
            <Textarea
              rows={2}
              value={(data.projetos as string | undefined) ?? ""}
              onChange={(e) => set("projetos", e.target.value)}
            />
          </div>
        </>
      )}

      {type === "Alvo" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estágio</Label>
              <Select
                value={(data.estagio as string | undefined) ?? "Lead"}
                onValueChange={(v) => set("estagio", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALVO_ESTAGIOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data do próximo passo</Label>
              <Input
                type="date"
                value={(data.proximoPassoData as string | undefined) ?? ""}
                onChange={(e) => set("proximoPassoData", e.target.value || null)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Próximo passo</Label>
            <Input
              placeholder="Ex: mandar press kit, marcar call…"
              value={(data.proximoPasso as string | undefined) ?? ""}
              onChange={(e) => set("proximoPasso", e.target.value)}
            />
          </div>
        </>
      )}

      {type === "Músico" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Instrumentos</Label>
            <Input
              placeholder="Sax, vocal, guitarra…"
              value={(data.instrumentos as string | undefined) ?? ""}
              onChange={(e) => set("instrumentos", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Gêneros</Label>
            <Input
              placeholder="House, MPB, techno…"
              value={(data.generos as string | undefined) ?? ""}
              onChange={(e) => set("generos", e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea
          rows={3}
          value={(data.notas as string | undefined) ?? ""}
          onChange={(e) => set("notas", e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

/** Aba Serviços do Fornecedor: tabela de preços (esvaziar libera tirar o papel). */
export function ServicesTabContent({ supplierId }: { supplierId: number }) {
  const [services, setServices] = useState<SupplierService[]>([]);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setServices(await listServices(supplierId));
  }
  useEffect(() => {
    void refresh();
  }, [supplierId]);

  async function add() {
    if (!description.trim()) {
      toast.error("Descreva o serviço");
      return;
    }
    setSaving(true);
    try {
      await createService(supplierId, {
        description: description.trim(),
        unit: unit.trim() || null,
        price: price ? Number(price) : null,
      });
      setDescription("");
      setUnit("");
      setPrice("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    await deleteService(id);
    await refresh();
  }

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground">
        Informações exclusivas de fornecedor. Esvazie esta lista para poder tirar o papel de Fornecedor.
      </p>

      {services.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-left">Unidade</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">{s.description}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.unit ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.price != null ? formatCurrency(s.price) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Remover serviço"
                      onClick={() => void remove(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Serviço</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Locação de CDJ" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unidade</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="diária, hora…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preço (R$)</Label>
          <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <Button size="sm" onClick={add} disabled={saving}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
    </div>
  );
}
