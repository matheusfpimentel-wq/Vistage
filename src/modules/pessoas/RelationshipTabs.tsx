import { useEffect, useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
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
  RELATIONSHIP_CATEGORIES,
  type Contact,
  type ContactRelationshipType,
  type RelationshipData,
} from "@/modules/crm/types";
import {
  createService,
  deleteService,
  getSupplier,
  listServices,
  updateSupplier,
} from "@/modules/suppliers/api";
import { SUPPLIER_CATEGORIES, type SupplierService } from "@/modules/suppliers/types";
import { listMeetingsForContact } from "@/modules/meetings/api";
import type { Meeting } from "@/modules/meetings/types";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/format";

/** Rótulo da aba de cada tipo de relação. */
export const RELATION_TAB_LABEL: Record<ContactRelationshipType, string> = {
  Contratante: "Contratação",
  Parceiro: "Parceria",
  Alvo: "Prospecção",
  "Músico": "Música",
};

function CategoriaSelect({
  type,
  value,
  onChange,
}: {
  type: ContactRelationshipType;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Categoria</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="max-w-xs">
          <SelectValue placeholder="Selecionar…" />
        </SelectTrigger>
        <SelectContent>
          {RELATIONSHIP_CATEGORIES[type].map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Aba de uma relação: edita os campos específicos (relationship_data[type]). */
export function RelationshipTabContent({
  type,
  contact,
  onSaved,
  onCreateGig,
}: {
  type: ContactRelationshipType;
  contact: Contact;
  onSaved: () => void;
  onCreateGig?: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(
    (contact.relationship_data[type] as Record<string, unknown>) ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    setData((contact.relationship_data[type] as Record<string, unknown>) ?? {});
  }, [contact, type]);

  useEffect(() => {
    if (type === "Contratante") {
      void listMeetingsForContact(contact.id).then(setMeetings).catch(() => setMeetings([]));
    }
  }, [type, contact.id]);

  const set = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));
  const str = (key: string) => (data[key] as string | undefined) ?? "";

  async function save() {
    setSaving(true);
    try {
      const next: RelationshipData = { ...contact.relationship_data, [type]: data };
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
      <CategoriaSelect type={type} value={data.categoria as string | undefined} onChange={(v) => set("categoria", v)} />

      {type === "Contratante" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {onCreateGig && (
              <Button size="sm" variant="outline" onClick={onCreateGig}>
                <CalendarPlus className="h-4 w-4" /> Nova GIG com esta pessoa
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              GIGs anteriores e faturamento aparecem no topo e na aba GIGs.
            </span>
          </div>
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Reuniões</Label>
              <Link to="/reunioes" className="text-xs text-primary hover:underline">
                Ir para Reuniões
              </Link>
            </div>
            {meetings.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Nenhuma reunião vinculada. Em Reuniões, use "+ Vincular pessoa".
              </p>
            ) : (
              <div className="space-y-1.5">
                {meetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="truncate">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.date ? formatDate(m.date) : "sem data"} · {m.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {type === "Músico" && (
        <>
          <div className="space-y-1.5">
            <Label>O que faz</Label>
            <Input placeholder="Ex: DJ/produtor, cantora, baixista…" value={str("oQueFaz")} onChange={(e) => set("oQueFaz", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Onde toca</Label>
            <Input placeholder="Casas, festivais, circuito…" value={str("ondeToca")} onChange={(e) => set("ondeToca", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Instrumentos</Label>
              <Input placeholder="Sax, vocal, guitarra…" value={str("instrumentos")} onChange={(e) => set("instrumentos", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gêneros</Label>
              <Input placeholder="House, MPB, techno…" value={str("generos")} onChange={(e) => set("generos", e.target.value)} />
            </div>
          </div>
        </>
      )}

      {type === "Parceiro" && (
        <>
          <div className="space-y-1.5">
            <Label>Situação da parceria</Label>
            <Input placeholder="Ativa, em negociação, pausada…" value={str("situacao")} onChange={(e) => set("situacao", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Projetos / colaborações</Label>
            <Textarea rows={2} value={str("projetos")} onChange={(e) => set("projetos", e.target.value)} />
          </div>
        </>
      )}

      {type === "Alvo" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estágio</Label>
              <Select value={(data.estagio as string | undefined) ?? "Lead"} onValueChange={(v) => set("estagio", v)}>
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
              <Input type="date" value={str("proximoPassoData")} onChange={(e) => set("proximoPassoData", e.target.value || null)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Objetivo com esta pessoa</Label>
            <Input placeholder="Ex: fechar residência, tocar no festival X…" value={str("objetivos")} onChange={(e) => set("objetivos", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de abordagem</Label>
            <Textarea rows={2} placeholder="Como pretende chegar nessa pessoa" value={str("abordagem")} onChange={(e) => set("abordagem", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Próximo passo</Label>
            <Input placeholder="Ex: mandar press kit, marcar call…" value={str("proximoPasso")} onChange={(e) => set("proximoPasso", e.target.value)} />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea rows={3} value={str("notas")} onChange={(e) => set("notas", e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

/** Aba Serviços do Fornecedor: categoria + tabela de preços (esvaziar libera tirar o papel). */
export function ServicesTabContent({ supplierId }: { supplierId: number }) {
  const [services, setServices] = useState<SupplierService[]>([]);
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [svcs, sup] = await Promise.all([listServices(supplierId), getSupplier(supplierId)]);
    setServices(svcs);
    setCategory(sup?.category ?? "");
  }
  useEffect(() => {
    void refresh();
  }, [supplierId]);

  async function saveCategory(v: string) {
    setCategory(v);
    await updateSupplier({ id: supplierId, category: v as never });
  }

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
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={category} onValueChange={saveCategory}>
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Selecionar…" />
          </SelectTrigger>
          <SelectContent>
            {SUPPLIER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Tabela de preços. Esvazie a lista para poder tirar o papel de Fornecedor.
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
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover serviço" onClick={() => void remove(s.id)}>
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
