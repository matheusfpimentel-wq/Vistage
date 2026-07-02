import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { cn } from "@/lib/utils";
import { EMPTY_VALUE, formatCurrency, formatDate, toLocalISODate } from "@/lib/format";
import { urgencyLevel, urgencyClass, type UrgencyLevel } from "@/lib/urgency";
import {
  DEFAULT_MARKETING_ASSETS,
  MARKETING_ASSET_STATUSES,
  MARKETING_CHANNELS,
  MARKETING_MILESTONES,
  marketingAssetStatusLabel,
  marketingRoleLabel,
  type MarketingAssetStatus,
  type MarketingRole,
  type PartyBudgetItem,
  type PartyMarketingAction,
  type PartyMarketingAsset,
  type PartyStage,
  type PartyTicket,
} from "../types";
import {
  createPartyBudgetItem,
  createPartyMarketingAction,
  createPartyMarketingAsset,
  deletePartyMarketingAction,
  deletePartyMarketingAsset,
  listPartyMarketingActions,
  listPartyMarketingAssets,
  syncMarketingActionTask,
  updatePartyMarketingAction,
  updatePartyMarketingAsset,
  updatePartyStage,
} from "../api";

const MARKETING_CATEGORY = "Marketing";
type Block = "estrategia" | "artes" | "canais" | "mensuracao";

// Guarda de concorrência do backfill entre remounts. O painel desmonta ao
// colapsar a etapa (vive dentro do bloco expandido do WorkflowTab), então o
// ref local `backfilled` reseta a cada montagem. Sem isto, colapsar+reexpandir
// rápido antes do flag `_mkt_migrated` persistir dispararia o backfill duas
// vezes em paralelo e duplicaria ações/peças. O Set é síncrono (add antes do
// 1º await), então a 2ª montagem enxerga o stage.id e desiste.
const backfillingStages = new Set<number>();

function assetStatusClass(s: MarketingAssetStatus): string {
  return s === "publicada"
    ? "bg-emerald-500/20 text-emerald-400"
    : s === "aprovada"
    ? "bg-sky-500/20 text-sky-400"
    : s === "em_producao"
    ? "bg-amber-500/20 text-amber-400"
    : "bg-muted text-muted-foreground";
}
function nextAssetStatus(s: MarketingAssetStatus): MarketingAssetStatus {
  const i = MARKETING_ASSET_STATUSES.indexOf(s);
  return MARKETING_ASSET_STATUSES[(i + 1) % MARKETING_ASSET_STATUSES.length];
}
function mktLevel(date: string | null, done: boolean): UrgencyLevel | null {
  return done ? null : urgencyLevel(date, "deadline");
}

/**
 * Painel da etapa Marketing — 4 blocos em acordeão (um aberto por vez):
 * Estratégia, Artes, Canais & Calendário, Mensuração. Cada bloco fechado mostra
 * uma linha de resumo. Meta é de VENDAS (nº ou % da capacidade); orçamento é a
 * soma read-only da categoria Marketing do Orçamento (fonte única); Artes e
 * Canais são listas rastreáveis (não texto solto); Mensuração calcula de fontes
 * reais (Orçamento + Ingressos). Migra os campos antigos uma única vez.
 */
export function MarketingStagePanel({
  partyId,
  stage,
  partyTitle,
  budgetItems,
  tickets,
  expectedCapacity,
  onReload,
}: {
  partyId: number;
  stage: PartyStage;
  partyTitle: string;
  budgetItems: PartyBudgetItem[];
  tickets: PartyTicket[];
  expectedCapacity: number | null;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState<Block>("estrategia");
  const [assets, setAssets] = useState<PartyMarketingAsset[]>([]);
  const [actions, setActions] = useState<PartyMarketingAction[]>([]);

  const f = stage.fields;
  const [metaVendas, setMetaVendas] = useState(f.meta_vendas != null ? String(f.meta_vendas) : "");
  const [metaTipo, setMetaTipo] = useState(typeof f.meta_vendas_tipo === "string" ? f.meta_vendas_tipo : "num");
  const [publicoAngulo, setPublicoAngulo] = useState(typeof f.publico_angulo === "string" ? f.publico_angulo : "");

  const reloadLists = useCallback(() => {
    void listPartyMarketingAssets(partyId).then(setAssets);
    void listPartyMarketingActions(partyId).then(setActions);
  }, [partyId]);
  useEffect(() => { reloadLists(); }, [reloadLists]);

  // ===== derivados (fontes reais) =====
  const soldTotal = tickets.reduce((s, t) => s + (t.quantity_sold || 0), 0);
  const mktProjected = budgetItems.filter((b) => b.category === MARKETING_CATEGORY).reduce((s, b) => s + (b.projected_amount || 0), 0);
  const mktActual = budgetItems.filter((b) => b.category === MARKETING_CATEGORY).reduce((s, b) => s + (b.actual_amount ?? 0), 0);
  const cac = soldTotal > 0 && mktActual > 0 ? mktActual / soldTotal : null;
  const metaAbs = useMemo(() => {
    const n = Number(metaVendas);
    if (!Number.isFinite(n) || n <= 0) return null;
    return metaTipo === "pct" ? Math.round(((expectedCapacity ?? 0) * n) / 100) : Math.round(n);
  }, [metaVendas, metaTipo, expectedCapacity]);
  const metaSecundariaAlcance = Number(f.meta_alcance) > 0 ? Number(f.meta_alcance) : null;

  // ===== backfill dos campos antigos (uma vez) =====
  const backfilled = useRef(false);
  useEffect(() => {
    if (backfilled.current || f._mkt_migrated || backfillingStages.has(stage.id)) return;
    backfilled.current = true;
    backfillingStages.add(stage.id);
    void runBackfill().finally(() => backfillingStages.delete(stage.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBackfill() {
    try {
      const estrategia = typeof f.estrategia === "string" ? f.estrategia.trim() : "";
      const canais = typeof f.canais === "string" ? f.canais.trim() : "";
      const arteStatus = typeof f.arte_status === "string" ? f.arte_status.trim() : "";
      const orcMkt = Number(f.orcamento_mkt) || 0;

      const nextPublico =
        typeof f.publico_angulo === "string" && f.publico_angulo.trim()
          ? f.publico_angulo
          : estrategia || null;
      const preserved = [
        canais ? `[Canais migrados]\n${canais}` : "",
        arteStatus ? `[Status das artes]\n${arteStatus}` : "",
      ].filter(Boolean).join("\n\n");
      const nextNotes = [stage.notes ?? "", preserved].filter(Boolean).join("\n\n") || null;

      // Marca migrado + preserva ANTES de criar linhas — se algo falhar, não
      // duplica na próxima abertura e nada de texto se perde (fica na nota).
      await updatePartyStage(stage.id, {
        notes: nextNotes,
        fields: { ...f, publico_angulo: nextPublico, _mkt_migrated: "1" },
      });
      if (typeof nextPublico === "string") setPublicoAngulo(nextPublico);

      // Idempotência durável: só cria se ainda não há linhas — mesmo que o
      // backfill rode duas vezes, a 2ª enxerga as linhas e não duplica.
      const canalLines = canais ? canais.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
      if (canalLines.length > 0 && (await listPartyMarketingActions(partyId)).length === 0) {
        let pos = 0;
        for (const line of canalLines) {
          await createPartyMarketingAction({
            party_id: partyId, canal: line.slice(0, 60), papel: "aquisicao",
            acao: null, date: null, done: 0, tracking_code: null, position: pos++,
          });
        }
      }
      if (arteStatus && (await listPartyMarketingAssets(partyId)).length === 0) {
        let apos = 0;
        for (const name of DEFAULT_MARKETING_ASSETS) {
          await createPartyMarketingAsset({
            party_id: partyId, name, format: null, due_date: null,
            status: "briefada", link: null, notes: null, content_id: null, position: apos++,
          });
        }
      }
      if (orcMkt > 0 && !budgetItems.some((b) => b.category === MARKETING_CATEGORY)) {
        await createPartyBudgetItem({
          party_id: partyId, category: MARKETING_CATEGORY, subcategory: null,
          description: "Marketing (migrado da etapa)", projected_amount: orcMkt,
          actual_amount: null, supplier_note: null, supplier_id: null,
          status: "projetado", date_paid: null,
          premissa: "Migrado do campo 'Orçamento de marketing'", nota_variancia: null,
        });
      }
      reloadLists();
      await onReload();
    } catch (e) {
      toast.error(`Não consegui migrar o Marketing: ${String(e)}`);
    }
  }

  async function saveStageFields(overrides?: { metaVendas?: string; metaTipo?: string; publicoAngulo?: string }) {
    const mv = overrides?.metaVendas ?? metaVendas;
    const mt = overrides?.metaTipo ?? metaTipo;
    const pa = overrides?.publicoAngulo ?? publicoAngulo;
    try {
      await updatePartyStage(stage.id, {
        fields: {
          ...stage.fields,
          // Preserva o flag de migração — evita reexecutar o backfill (duplicar
          // ações/peças) caso o prop `stage` ainda esteja defasado ao salvar.
          _mkt_migrated: "1",
          meta_vendas: mv.trim() === "" ? null : Number(mv),
          meta_vendas_tipo: mt,
          publico_angulo: pa.trim() || null,
        },
      });
      await onReload();
    } catch (e) {
      toast.error(`Não consegui salvar: ${String(e)}`);
    }
  }

  // ===== resumos (linha quando o bloco está fechado) =====
  const artesAtrasadas = assets.filter((a) => a.status !== "publicada" && mktLevel(a.due_date, false) === "overdue").length;
  const proximaAcao = actions.find((a) => !a.done && a.date && a.date.slice(0, 10) >= toLocalISODate());
  const acoesFeitas = actions.filter((a) => a.done).length;
  const acoesAtrasadas = actions.filter((a) => mktLevel(a.date, !!a.done) === "overdue").length;

  return (
    <div className="space-y-2">
      <BlockShell
        title="Estratégia"
        setOpen={() => setOpen("estrategia")}
        summary={
          metaAbs != null
            ? `meta ${metaAbs} ingressos${metaTipo === "pct" ? ` (${metaVendas}% da cap.)` : ""}`
            : "sem meta definida"
        }
        isOpen={open === "estrategia"}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Meta de vendas</label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                min={0}
                className="h-8 text-sm"
                placeholder={metaTipo === "pct" ? "% da capacidade" : "nº de ingressos"}
                value={metaVendas}
                onChange={(e) => setMetaVendas(e.target.value)}
                onBlur={() => void saveStageFields()}
              />
              <Select value={metaTipo} onValueChange={(v) => { setMetaTipo(v); void saveStageFields({ metaTipo: v }); }}>
                <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="num">nº</SelectItem>
                  <SelectItem value="pct">%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {metaTipo === "pct" && (
              <p className="text-[11px] text-muted-foreground">
                {expectedCapacity ? `= ${metaAbs ?? 0} ingressos de ${expectedCapacity} de capacidade` : "informe a capacidade esperada na Info"}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Orçamento de marketing</label>
            <div className="flex h-8 items-center justify-between rounded-md border bg-muted/30 px-2.5 text-sm">
              <span className="tabular-nums font-medium">{formatCurrency(mktProjected)}</span>
              <span className="text-[11px] text-muted-foreground">soma da categoria Marketing no Orçamento</span>
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Público & ângulo desta edição</label>
            <Textarea
              rows={2}
              className="text-sm"
              placeholder="Pra quem é e qual o ângulo/posicionamento desta edição…"
              value={publicoAngulo}
              onChange={(e) => setPublicoAngulo(e.target.value)}
              onBlur={() => void saveStageFields()}
            />
          </div>
          {metaSecundariaAlcance != null && (
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              Alcance (métrica secundária): meta {metaSecundariaAlcance.toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      </BlockShell>

      <BlockShell
        title="Artes & Conteúdo"
        setOpen={() => setOpen("artes")}
        isOpen={open === "artes"}
        summary={`${assets.length} peça(s)${artesAtrasadas > 0 ? ` · ${artesAtrasadas} atrasada(s)` : ""}`}
      >
        <AssetsBlock partyId={partyId} assets={assets} onChanged={reloadLists} />
      </BlockShell>

      <BlockShell
        title="Canais & Calendário"
        setOpen={() => setOpen("canais")}
        isOpen={open === "canais"}
        summary={
          actions.length === 0
            ? "sem ações"
            : `${actions.length} ação(ões) · ${acoesFeitas} feita(s)${acoesAtrasadas > 0 ? ` · ${acoesAtrasadas} atrasada(s)` : ""}${proximaAcao?.date ? ` · próxima ${formatDate(proximaAcao.date)}` : ""}`
        }
      >
        <ActionsBlock partyId={partyId} partyTitle={partyTitle} actions={actions} onChanged={reloadLists} />
      </BlockShell>

      <BlockShell
        title="Mensuração"
        setOpen={() => setOpen("mensuracao")}
        isOpen={open === "mensuracao"}
        summary={cac != null ? `CAC ${formatCurrency(cac)}` : soldTotal > 0 ? "sem gasto registrado" : "sem vendas ainda"}
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">CAC</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">
                {cac != null ? formatCurrency(cac) : EMPTY_VALUE}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {mktActual <= 0 ? "sem gasto de marketing registrado" : soldTotal <= 0 ? "sem vendas ainda" : `${formatCurrency(mktActual)} / ${soldTotal} compradores`}
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendido vs meta</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">
                {soldTotal}{metaAbs != null ? ` / ${metaAbs}` : ""}
              </div>
              {metaAbs != null && metaAbs > 0 ? (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round((soldTotal / metaAbs) * 100))}%` }}
                  />
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground">defina a meta na Estratégia</div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Por canal: aparece quando as vendas forem marcadas por código de rastreio (ainda sem dados por código).
          </p>
        </div>
      </BlockShell>
    </div>
  );
}

/** Casca de bloco do acordeão — cabeçalho clicável + resumo quando fechado. */
function BlockShell({
  title,
  summary,
  isOpen,
  setOpen,
  children,
}: {
  title: string;
  summary: string;
  isOpen: boolean;
  setOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border", isOpen && "ring-1 ring-primary/40")}>
      <button
        type="button"
        onClick={setOpen}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2">
          {!isOpen && <span className="truncate text-[11px] text-muted-foreground">{summary}</span>}
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        </span>
      </button>
      {isOpen && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

/** Bloco ARTES — peças com pipeline de status, prazo e link; adição inline. */
function AssetsBlock({
  partyId,
  assets,
  onChanged,
}: {
  partyId: number;
  assets: PartyMarketingAsset[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");

  async function add(assetName: string) {
    const n = assetName.trim();
    if (!n) return;
    try {
      await createPartyMarketingAsset({
        party_id: partyId, name: n, format: null, due_date: null,
        status: "briefada", link: null, notes: null, content_id: null, position: assets.length,
      });
      setName("");
      onChanged();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }
  function patch(id: number, updates: Partial<PartyMarketingAsset>) {
    void updatePartyMarketingAsset(id, updates).then(onChanged).catch((e) => toast.error(`Erro: ${String(e)}`));
  }
  async function remove(id: number) {
    const item = assets.find((a) => a.id === id);
    if (!item) return;
    await deleteWithUndo({
      label: "Peça de marketing",
      remove: () => deletePartyMarketingAsset(id),
      restore: async () => {
        await createPartyMarketingAsset(item);
      },
      onChange: onChanged,
    });
  }

  const missing = DEFAULT_MARKETING_ASSETS.filter((d) => !assets.some((a) => a.name.trim().toLowerCase() === d.toLowerCase()));

  return (
    <div className="space-y-2">
      {assets.length > 0 && (
        <ul className="space-y-1">
          {assets.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => patch(a.id, { status: nextAssetStatus(a.status) })}
                className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", assetStatusClass(a.status))}
                title="Avançar status"
              >
                {marketingAssetStatusLabel(a.status)}
              </button>
              <Input
                type="date"
                className={cn("h-7 w-32 shrink-0 text-xs", urgencyClass(mktLevel(a.due_date, a.status === "publicada")))}
                value={a.due_date ?? ""}
                onChange={(e) => patch(a.id, { due_date: e.target.value || null })}
              />
              <Input
                className="h-7 w-36 shrink-0 text-xs"
                placeholder="Link"
                defaultValue={a.link ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (a.link ?? null)) patch(a.id, { link: v });
                }}
              />
              {a.link && (
                <a href={a.link} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Abrir link">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button type="button" onClick={() => void remove(a.id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remover peça">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {missing.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void add(d)}
              className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> {d}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          className="h-8 flex-1 text-xs"
          placeholder="Nova peça (ex.: Carrossel line-up)…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void add(name); }}
        />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void add(name)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Bloco CANAIS & CALENDÁRIO — ações datadas com papel; marcos de 1 toque. */
function ActionsBlock({
  partyId,
  partyTitle,
  actions,
  onChanged,
}: {
  partyId: number;
  partyTitle: string;
  actions: PartyMarketingAction[];
  onChanged: () => void;
}) {
  const [canal, setCanal] = useState<string>(MARKETING_CHANNELS[0]);
  const [acao, setAcao] = useState("");

  // Ação datada gera uma tarefa com o vencimento na data (§2.4). Idempotente por
  // ação; mantém título/data em dia conforme o dono edita.
  function syncTask(a: PartyMarketingAction, overrides: Partial<PartyMarketingAction>) {
    const merged = { ...a, ...overrides };
    void syncMarketingActionTask({
      actionId: a.id,
      partyTitle,
      canal: merged.canal,
      acao: merged.acao,
      date: merged.date,
    }).catch(() => {});
  }

  async function add(a: { canal: string; acao: string | null; papel?: MarketingRole; date?: string | null }) {
    try {
      await createPartyMarketingAction({
        party_id: partyId, canal: a.canal, papel: a.papel ?? "aquisicao",
        acao: a.acao, date: a.date ?? null, done: 0, tracking_code: null, position: actions.length,
      });
      onChanged();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }
  function patch(id: number, updates: Partial<PartyMarketingAction>) {
    void updatePartyMarketingAction(id, updates).then(onChanged).catch((e) => toast.error(`Erro: ${String(e)}`));
  }
  async function remove(id: number) {
    const item = actions.find((a) => a.id === id);
    if (!item) return;
    await deleteWithUndo({
      label: "Ação de marketing",
      remove: () => deletePartyMarketingAction(id),
      restore: async () => {
        await createPartyMarketingAction(item);
      },
      onChange: onChanged,
    });
  }

  return (
    <div className="space-y-2">
      {/* Marcos de campanha — 1 toque cria a ação (o produtor preenche a data). */}
      <div className="flex flex-wrap gap-1.5">
        {MARKETING_MILESTONES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => void add({ canal: "Instagram festa", acao: m })}
            className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> {m}
          </button>
        ))}
      </div>

      {actions.length > 0 && (
        <ul className="space-y-1">
          {actions.map((a) => (
            <li key={a.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm", mktLevel(a.date, !!a.done) === "overdue" && "border-destructive/50 bg-destructive/5")}>
              <input
                type="checkbox"
                checked={!!a.done}
                onChange={() => patch(a.id, { done: a.done ? 0 : 1 })}
                className="h-4 w-4 shrink-0"
                title="Feito"
              />
              <Badge variant="outline" className="shrink-0 text-[10px]">{a.canal}</Badge>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{marketingRoleLabel(a.papel)}</span>
              <Input
                className={cn("h-7 min-w-[8rem] flex-1 text-xs", a.done && "line-through text-muted-foreground")}
                placeholder="O que fazer"
                defaultValue={a.acao ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== (a.acao ?? null)) {
                    patch(a.id, { acao: v });
                    syncTask(a, { acao: v });
                  }
                }}
              />
              <Input
                type="date"
                className="h-7 w-32 shrink-0 text-xs"
                value={a.date ?? ""}
                onChange={(e) => {
                  const date = e.target.value || null;
                  patch(a.id, { date });
                  syncTask(a, { date });
                }}
                title="Com data preenchida, cria uma tarefa com este vencimento"
              />
              <button type="button" onClick={() => void remove(a.id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remover ação">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MARKETING_CHANNELS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 flex-1 text-xs"
          placeholder="Ação (ex.: Postar reveal do line-up)…"
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && acao.trim()) { void add({ canal, acao: acao.trim() }); setAcao(""); } }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => { if (acao.trim()) { void add({ canal, acao: acao.trim() }); setAcao(""); } }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        A maior parte da venda acontece na reta final; carregue o calendário até a última semana, não só no anúncio.
      </p>
    </div>
  );
}
