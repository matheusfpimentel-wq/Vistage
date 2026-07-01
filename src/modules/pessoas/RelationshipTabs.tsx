import { useEffect, useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALVO_ESTAGIOS,
  PARCERIA_SITUACOES,
  RELATIONSHIP_CATEGORIES,
  type ContactRelationshipType,
} from "@/modules/crm/types";
import {
  createService,
  deleteService,
  listServices,
  updateService,
  updateSupplier,
} from "@/modules/suppliers/api";
import { SUPPLIER_CATEGORIES, type SupplierService } from "@/modules/suppliers/types";
import { listMeetingsForContact } from "@/modules/meetings/api";
import type { Meeting } from "@/modules/meetings/types";
import { CURRENCIES } from "@/modules/finance/types";
import { InfoHint } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/format";

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
        <SelectTrigger>
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

/**
 * Aba de uma relação: edita os campos específicos (relationship_data[type]).
 * CONTROLADA pelo pai (ContactDetail): os campos vivem num rascunho compartilhado
 * e só são gravados quando o usuário clica no único "Salvar" do diálogo — assim
 * dá pra editar várias abas antes de salvar, sem perder nada ao trocar de aba.
 */
export function RelationshipTabContent({
  type,
  contactId,
  data,
  onChange,
  onCreateGig,
}: {
  type: ContactRelationshipType;
  contactId: number;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  onCreateGig?: () => void;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    if (type === "Contratante" || type === "Parceiro") {
      void listMeetingsForContact(contactId).then(setMeetings).catch(() => setMeetings([]));
    }
  }, [type, contactId]);

  const set = (key: string, value: unknown) => onChange({ ...data, [key]: value });
  const str = (key: string) => (data[key] as string | undefined) ?? "";

  return (
    <div className="space-y-3 pt-2">
      {type === "Contratante" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CategoriaSelect type={type} value={data.categoria as string | undefined} onChange={(v) => set("categoria", v)} />
            <div className="space-y-1.5">
              <Label>Função</Label>
              <Input placeholder="Ex: contratante, curador, produtor…" value={str("funcao")} onChange={(e) => set("funcao", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cachê de referência</Label>
              <div className="flex gap-2">
                <Select value={(data.cacheMoeda as string | undefined) ?? "BRL"} onValueChange={(v) => set("cacheMoeda", v)}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ex: 2500"
                  value={(data.cacheReferencia as number | undefined) ?? ""}
                  onChange={(e) => set("cacheReferencia", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de contratação</Label>
              <Select value={(data.cacheTipo as string | undefined) ?? "Por hora"} onValueChange={(v) => set("cacheTipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Por hora">Por hora</SelectItem>
                  <SelectItem value="Full time">Full time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {onCreateGig && (
            <Button size="sm" variant="outline" onClick={onCreateGig}>
              <CalendarPlus className="h-4 w-4" /> Nova GIG com esta pessoa
            </Button>
          )}
          <MeetingsBlock meetings={meetings} />
        </>
      )}

      {type === "Músico" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CategoriaSelect type={type} value={data.categoria as string | undefined} onChange={(v) => set("categoria", v)} />
            <div className="space-y-1.5">
              <Label>O que faz</Label>
              <Input placeholder="Ex: DJ/produtor, cantora, baixista…" value={str("oQueFaz")} onChange={(e) => set("oQueFaz", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Onde toca</Label>
              <Input placeholder="Casas, festivais, circuito…" value={str("ondeToca")} onChange={(e) => set("ondeToca", e.target.value)} />
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CategoriaSelect type={type} value={data.categoria as string | undefined} onChange={(v) => set("categoria", v)} />
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Situação
                <InfoHint>
                  Vira "Pausada" sozinha quando não há GIG vinculada à pessoa há mais de 60 dias.
                </InfoHint>
              </Label>
              <Select value={str("situacao") || undefined} onValueChange={(v) => set("situacao", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {PARCERIA_SITUACOES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(() => {
            const list = (data.parceriasAtivas as string[] | undefined) ?? (str("projetos") ? [str("projetos")] : []);
            const update = (next: string[]) => set("parceriasAtivas", next);
            return (
              <div className="space-y-1.5">
                <Label>Parcerias ativas</Label>
                <div className="space-y-1.5">
                  {list.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="Ex: EP conjunto, residência, coletivo…"
                        value={p}
                        onChange={(e) => update(list.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                      <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={() => update(list.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={() => update([...list, ""])}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar parceria
                  </Button>
                </div>
              </div>
            );
          })()}
          <MeetingsBlock meetings={meetings} />
        </>
      )}

      {type === "Alvo" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CategoriaSelect type={type} value={data.categoria as string | undefined} onChange={(v) => set("categoria", v)} />
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
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Próximo passo</Label>
              <Input placeholder="Ex: mandar press kit, marcar call…" value={str("proximoPasso")} onChange={(e) => set("proximoPasso", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data do próximo passo</Label>
              <Input type="date" value={str("proximoPassoData")} onChange={(e) => set("proximoPassoData", e.target.value || null)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Objetivo</Label>
              <Input placeholder="Ex: fechar residência, tocar no festival X…" value={str("objetivos")} onChange={(e) => set("objetivos", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de abordagem</Label>
              <Input placeholder="Como pretende chegar nessa pessoa" value={str("abordagem")} onChange={(e) => set("abordagem", e.target.value)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Bloco de Reuniões vinculadas (reutilizado em Contratante e Parceiro). */
function MeetingsBlock({ meetings }: { meetings: Meeting[] }) {
  return (
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
  );
}

/** Aba Serviços do Fornecedor: categoria + tabela de preços (esvaziar libera tirar o papel). */
export function ServicesTabContent({ supplierId }: { supplierId: number }) {
  const [services, setServices] = useState<SupplierService[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setServices(await listServices(supplierId));
  }
  useEffect(() => {
    void refresh();
  }, [supplierId]);

  // Edita localmente (responsivo); persiste ao sair do campo (onBlur).
  function editLocal(id: number, patch: Partial<SupplierService>) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // Categoria do fornecedor passa a ser DERIVADA da 1ª linha com categoria.
  async function syncSupplierCategory(list: SupplierService[]) {
    const first = list.find((x) => x.category)?.category ?? null;
    await updateSupplier({ id: supplierId, category: (first as never) ?? null });
  }

  async function commit(s: SupplierService) {
    await updateService(s.id, {
      category: s.category ?? null,
      description: s.description ?? "",
      unit: s.unit ?? null,
      price: s.price ?? null,
    });
    await syncSupplierCategory(services);
  }

  async function addRow() {
    setBusy(true);
    try {
      await createService(supplierId, { description: "", category: null, unit: null, price: null });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await deleteService(id);
    const next = services.filter((s) => s.id !== id);
    setServices(next);
    await syncSupplierCategory(next);
  }

  // Sugestões pesquisáveis (datalist) para Categoria e Serviço.
  const descSuggestions = Array.from(new Set(services.map((s) => s.description).filter(Boolean)));

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground">
        Serviços e preços — uma linha por serviço, com sua própria categoria.
        Esvazie a lista para poder tirar o papel de Fornecedor.
      </p>

      <datalist id="svc-cat-list">
        {SUPPLIER_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="svc-desc-list">
        {descSuggestions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {services.length > 0 && (
        <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_90px_110px_auto]">
          <span>Categoria</span>
          <span>Serviço</span>
          <span>Unidade</span>
          <span>Preço</span>
          <span />
        </div>
      )}
      <div className="space-y-2">
        {services.map((s) => (
          <div key={s.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_90px_110px_auto] sm:items-center">
            <Input
              list="svc-cat-list"
              placeholder="Categoria"
              value={s.category ?? ""}
              onChange={(e) => editLocal(s.id, { category: e.target.value || null })}
              onBlur={() => void commit(s)}
            />
            <Input
              list="svc-desc-list"
              placeholder="Ex: Locação de CDJ"
              value={s.description}
              onChange={(e) => editLocal(s.id, { description: e.target.value })}
              onBlur={() => void commit(s)}
            />
            <Input
              placeholder="diária…"
              value={s.unit ?? ""}
              onChange={(e) => editLocal(s.id, { unit: e.target.value || null })}
              onBlur={() => void commit(s)}
            />
            <Input
              type="number"
              min={0}
              placeholder="R$"
              value={s.price ?? ""}
              onChange={(e) => editLocal(s.id, { price: e.target.value ? Number(e.target.value) : null })}
              onBlur={() => void commit(s)}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remover serviço" onClick={() => void remove(s.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={() => void addRow()} disabled={busy}>
        <Plus className="h-4 w-4" /> Adicionar serviço
      </Button>
    </div>
  );
}
