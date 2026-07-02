import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, FileDown, MessageCircle, Plus, Trash2, UserPlus } from "lucide-react";
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
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EMPTY_VALUE, formatCurrency, toLocalISODate } from "@/lib/format";
import { urgencyLevel, urgencyClass } from "@/lib/urgency";
import {
  COMPLIANCE_RESPONSAVEIS,
  complianceExplain,
  complianceResponsavelLabel,
  complianceStatusLabel,
  type ComplianceStatus,
  type ConfirmStatus,
  type LineupStatus,
  type PartyComplianceItem,
  type PartySponsor,
  type PartyStage,
  type PartyTeamMember,
  type RiderItem,
} from "../types";
import {
  createPartyComplianceItem,
  deletePartyComplianceItem,
  listPartyCompliance,
  seedDefaultCompliance,
  updatePartyComplianceItem,
  updatePartyStage,
} from "../api";
import { RiderField, ChecklistField } from "./WorkflowTab";
import { riderToText, printRiderPdf } from "../riderExport";
import type { Contact } from "@/modules/crm/types";
import type { Supplier } from "@/modules/suppliers/types";

type EBlock = "confirmacoes" | "formalidades" | "rider" | "checklist" | "notas";

// Guarda de concorrência do backfill entre remounts (painel desmonta ao colapsar).
const execBackfilling = new Set<number>();

const CHECKLIST_SUGGESTIONS = [
  "Imprimir lista VIP",
  "Cabos reserva",
  "Combinar load-in com a casa",
  "Combinar horário de load-out",
  "Fita/gaffer e extensões",
  "Água/camarim dos DJs",
  "Caixa/troco de portaria",
  "Pulseiras/lacres de entrada",
  "Confirmar segurança/portaria",
  "Passagem de som",
  "Ponto de energia da cabine",
  "Backup do set (pendrive/HD)",
  "Rádios/HTs da equipe carregados",
  "Bar abastecido (gelo, copos)",
  "Sinalização (banheiros, saídas)",
  "Kit primeiros socorros",
];

/** wa.me a partir de um telefone do cadastro (só dígitos). */
function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

/** Prazo default "confirmar até" = data da festa − 7 dias. */
function defaultConfirmBy(partyDate: string | null): string | null {
  if (!partyDate) return null;
  const d = new Date(partyDate.slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() - 7);
  return toLocalISODate(d);
}

type ConfirmRow = {
  key: string;
  name: string;
  detail: string;
  status: ConfirmStatus;
  confirmBy: string | null;
  phone: string | null;
  onCycle: () => void;
  onDate: (v: string | null) => void;
};

/**
 * Painel da etapa Execução — o "antes do dia": acordeão Confirmações · Formalidades ·
 * Rider técnico · Checklist · Notas. Confirmações é uma view read-through da Equipe
 * (status vive no próprio registro, fonte única); Formalidades usa party_compliance
 * (responsável/prazo/status), com explicações só no "?". % de prontidão alimenta o
 * resumo. Migra os campos antigos (equipe/fornecedores) uma única vez.
 */
export function ExecucaoStagePanel({
  partyId,
  stage,
  partyTitle,
  partyDate,
  team,
  sponsors,
  lineup,
  lineupStatus,
  contacts,
  suppliers,
  onPatchTeam,
  onPatchSponsors,
  onPatchLineupStatus,
  onOpenEquipe,
  onReload,
}: {
  partyId: number;
  stage: PartyStage;
  partyTitle: string;
  partyDate: string | null;
  team: PartyTeamMember[];
  sponsors: PartySponsor[];
  lineup: number[];
  lineupStatus: LineupStatus;
  contacts: Contact[];
  suppliers: Supplier[];
  onPatchTeam: (mapper: (prev: PartyTeamMember[]) => PartyTeamMember[]) => void;
  onPatchSponsors: (mapper: (prev: PartySponsor[]) => PartySponsor[]) => void;
  onPatchLineupStatus: (mapper: (prev: LineupStatus) => LineupStatus) => void;
  onOpenEquipe: () => void;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState<EBlock>("confirmacoes");
  const [compliance, setCompliance] = useState<PartyComplianceItem[]>([]);
  const [showNa, setShowNa] = useState(false);

  const f = stage.fields;
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const reloadCompliance = useCallback(() => {
    void listPartyCompliance(partyId).then(setCompliance);
  }, [partyId]);
  useEffect(() => { reloadCompliance(); }, [reloadCompliance]);

  const dueDefault = defaultConfirmBy(partyDate);

  // ===== persistência de campos da etapa (rider/checklist/notas) =====
  const saveField = useCallback(
    async (key: string, value: string | null) => {
      try {
        await updatePartyStage(stage.id, { fields: { ...stage.fields, _exec_migrated: "1", [key]: value } });
        await onReload();
      } catch (e) {
        toast.error(`Não consegui salvar: ${String(e)}`);
      }
    },
    [stage.id, stage.fields, onReload]
  );
  const saveNotes = useCallback(
    async (notes: string) => {
      try {
        await updatePartyStage(stage.id, { notes: notes.trim() || null });
        await onReload();
      } catch (e) {
        toast.error(`Não consegui salvar: ${String(e)}`);
      }
    },
    [stage.id, onReload]
  );

  // ===== backfill (uma vez): equipe/fornecedores → confirmações + notas =====
  const backfilled = useRef(false);
  useEffect(() => {
    if (backfilled.current || f._exec_migrated || execBackfilling.has(stage.id)) return;
    backfilled.current = true;
    execBackfilling.add(stage.id);
    void runBackfill().finally(() => execBackfilling.delete(stage.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBackfill() {
    try {
      const equipeTxt = typeof f.equipe === "string" ? f.equipe.trim() : "";
      let fornecedoresIds: number[] = [];
      try {
        const p = JSON.parse(String(f.fornecedores_fechados ?? ""));
        if (Array.isArray(p)) fornecedoresIds = p.filter((x) => typeof x === "number");
      } catch { /* texto legado ou vazio */ }

      // Casa nomes do textarea "Equipe confirmada" com os membros da Equipe.
      let nextTeam = team.map((m) => ({ ...m }));
      if (equipeTxt) {
        const names = equipeTxt.split(/\r?\n|,/).map((s) => s.trim().toLowerCase()).filter(Boolean);
        nextTeam = nextTeam.map((m) =>
          names.some((n) => m.name.trim().toLowerCase().includes(n) || n.includes(m.name.trim().toLowerCase()))
            ? { ...m, status: "confirmado" as ConfirmStatus }
            : m
        );
      }
      // Fornecedores fechados: casa com membro (supplier_id) → confirmado; senão cria.
      for (const sid of fornecedoresIds) {
        const existing = nextTeam.find((m) => m.supplier_id === sid);
        if (existing) {
          existing.status = "confirmado";
        } else {
          const sup = supplierById.get(sid);
          if (sup) {
            nextTeam.push({
              name: sup.name, role: "Fornecedor", amount_cents: 0,
              supplier_id: sid, status: "confirmado", confirm_by: null, contact_id: null,
            });
          }
        }
      }

      // Preserva o texto original nas Notas da etapa ANTES de tudo.
      const preserved = [
        equipeTxt ? `[Equipe confirmada]\n${equipeTxt}` : "",
        fornecedoresIds.length ? `[Fornecedores fechados: ${fornecedoresIds.length} item(ns) migrados]` : "",
      ].filter(Boolean).join("\n\n");
      const nextNotes = [stage.notes ?? "", preserved].filter(Boolean).join("\n\n") || null;
      await updatePartyStage(stage.id, { notes: nextNotes, fields: { ...f, _exec_migrated: "1" } });

      if (JSON.stringify(nextTeam) !== JSON.stringify(team)) onPatchTeam(() => nextTeam);

      // Formalidades: semeia defaults só se ainda não há nenhum item.
      const current = await listPartyCompliance(partyId);
      if (current.length === 0) await seedDefaultCompliance(partyId);

      reloadCompliance();
      await onReload();
    } catch (e) {
      toast.error(`Não consegui migrar a Execução: ${String(e)}`);
    }
  }

  // ===== confirmações: linhas a partir da Equipe (fonte única) =====
  function cycleStatus(s: ConfirmStatus | null | undefined): ConfirmStatus {
    return s === "pendente" || s == null ? "confirmado" : s === "confirmado" ? "cancelado" : "pendente";
  }

  const djRows: ConfirmRow[] = lineup.map((cid) => {
    const c = contactById.get(cid);
    const st = lineupStatus[String(cid)] ?? {};
    const status = (st.status ?? "pendente") as ConfirmStatus;
    return {
      key: `dj-${cid}`,
      name: c?.name ?? `Contato #${cid}`,
      detail: "DJ / Músico",
      status,
      confirmBy: st.confirm_by ?? null,
      phone: c?.phone ?? null,
      onCycle: () => onPatchLineupStatus((prev) => {
        const cur = prev[String(cid)]?.status ?? "pendente";
        return { ...prev, [String(cid)]: { status: cycleStatus(cur), confirm_by: prev[String(cid)]?.confirm_by ?? dueDefault } };
      }),
      onDate: (v) => onPatchLineupStatus((prev) => ({
        ...prev, [String(cid)]: { status: prev[String(cid)]?.status ?? "pendente", confirm_by: v },
      })),
    };
  });

  const prodRows: ConfirmRow[] = team.map((m, i) => {
    const sup = m.supplier_id != null ? supplierById.get(m.supplier_id) : null;
    const c = m.contact_id != null ? contactById.get(m.contact_id) : null;
    const status = (m.status ?? "pendente") as ConfirmStatus;
    return {
      key: `team-${i}`,
      name: m.name || sup?.name || EMPTY_VALUE,
      detail: m.role || "Produção",
      status,
      confirmBy: m.confirm_by ?? null,
      phone: sup?.phone ?? c?.phone ?? null,
      onCycle: () => onPatchTeam((prev) =>
        prev.map((x, j) => (j === i ? { ...x, status: cycleStatus(x.status ?? "pendente"), confirm_by: x.confirm_by ?? dueDefault } : x))),
      onDate: (v) => onPatchTeam((prev) => prev.map((x, j) => (j === i ? { ...x, confirm_by: v } : x))),
    };
  });

  const sponsorRows: ConfirmRow[] = sponsors.map((s, i) => {
    const c = s.contact_id != null ? contactById.get(s.contact_id) : null;
    const status = (s.status ?? "pendente") as ConfirmStatus;
    return {
      key: `sp-${i}`,
      name: s.name || EMPTY_VALUE,
      detail: s.amount_cents ? formatCurrency(s.amount_cents / 100) : "Patrocinador",
      status,
      confirmBy: s.confirm_by ?? null,
      phone: c?.phone ?? null,
      onCycle: () => onPatchSponsors((prev) =>
        prev.map((x, j) => (j === i ? { ...x, status: cycleStatus(x.status ?? "pendente"), confirm_by: x.confirm_by ?? dueDefault } : x))),
      onDate: (v) => onPatchSponsors((prev) => prev.map((x, j) => (j === i ? { ...x, confirm_by: v } : x))),
    };
  });

  const allConfirm = [...djRows, ...prodRows, ...sponsorRows];
  const confDenom = allConfirm.filter((r) => r.status !== "cancelado").length;
  const confDone = allConfirm.filter((r) => r.status === "confirmado").length;
  const confLate = allConfirm.filter((r) => r.status === "pendente" && urgencyLevel(r.confirmBy, "deadline") === "overdue").length;

  // ===== formalidades =====
  const applicableCompliance = compliance.filter((c) => c.status !== "na");
  const complianceOk = applicableCompliance.filter((c) => c.status === "ok").length;
  const naCompliance = compliance.filter((c) => c.status === "na");
  const visibleCompliance = showNa ? compliance : compliance.filter((c) => c.status !== "na");

  // ===== checklist / prontidão =====
  const checklistRaw = typeof f.checklist_operacional === "string" ? f.checklist_operacional : "";
  let checklistItems: { text: string; done: boolean }[] = [];
  try { const p = JSON.parse(checklistRaw); if (Array.isArray(p)) checklistItems = p; } catch { /* vazio */ }
  const checklistDone = checklistItems.filter((i) => i.done).length;

  const prontidaoDenom = confDenom + applicableCompliance.length + checklistItems.length;
  const prontidaoNum = confDone + complianceOk + checklistDone;
  const prontidao = prontidaoDenom > 0 ? Math.round((prontidaoNum / prontidaoDenom) * 100) : null;

  const riderRaw = typeof f.rider_tecnico === "string" ? f.rider_tecnico : "";
  let riderItems: RiderItem[] = [];
  try { const p = JSON.parse(riderRaw); if (Array.isArray(p)) riderItems = p; } catch { /* vazio/legado */ }

  function cycleCompliance(s: ComplianceStatus): ComplianceStatus {
    return s === "pendente" ? "ok" : s === "ok" ? "na" : "pendente";
  }
  function patchCompliance(id: number, updates: Partial<PartyComplianceItem>) {
    void updatePartyComplianceItem(id, updates).then(reloadCompliance).catch((e) => toast.error(`Erro: ${String(e)}`));
  }

  return (
    <div className="space-y-2">
      {/* Prontidão da etapa */}
      <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Prontidão da Execução
          <InfoHint>Proporção simples de confirmações + formalidades aplicáveis + itens do checklist que já estão resolvidos.</InfoHint>
        </span>
        <span className="text-sm font-semibold tabular-nums">{prontidao != null ? `${prontidao}%` : EMPTY_VALUE}</span>
      </div>

      {/* ===== CONFIRMAÇÕES ===== */}
      <EBlockShell
        title="Confirmações"
        summary={confDenom > 0 ? `${confDone}/${confDenom} confirmados${confLate > 0 ? ` · ${confLate} atrasado` : ""}` : "sem equipe"}
        isOpen={open === "confirmacoes"}
        setOpen={() => setOpen("confirmacoes")}
      >
        <div className="space-y-3">
          <ConfirmGroup title="DJs / Músicos" rows={djRows} onCycleLabel={confirmStatusChipLabel} />
          <ConfirmGroup title="Produção" rows={prodRows} onCycleLabel={confirmStatusChipLabel} />
          <ConfirmGroup title="Patrocinadores" rows={sponsorRows} onCycleLabel={confirmStatusChipLabel} />
          <button type="button" onClick={onOpenEquipe} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <UserPlus className="h-3 w-3" /> + pessoa/fornecedor na Equipe
          </button>
        </div>
      </EBlockShell>

      {/* ===== FORMALIDADES ===== */}
      <EBlockShell
        title="Formalidades"
        summary={applicableCompliance.length > 0 ? `${complianceOk}/${applicableCompliance.length} ok` : "definir"}
        isOpen={open === "formalidades"}
        setOpen={() => setOpen("formalidades")}
      >
        <div className="space-y-2">
          {visibleCompliance.length > 0 ? (
            <ul className="space-y-1.5">
              {visibleCompliance.map((c) => {
                const explain = complianceExplain(c.category) ?? c.notes;
                const u = c.status === "ok" || c.status === "na" ? null : urgencyLevel(c.due_date, "deadline");
                return (
                  <li key={c.id} className="rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm">
                        {c.title}
                        {explain && <InfoHint>{explain}</InfoHint>}
                      </span>
                      <button
                        type="button"
                        onClick={() => patchCompliance(c.id, { status: cycleCompliance(c.status) })}
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          c.status === "ok" ? "bg-emerald-500/20 text-emerald-400"
                            : c.status === "na" ? "bg-muted text-muted-foreground"
                            : "bg-amber-500/20 text-amber-400"
                        )}
                        title="Avançar status"
                      >
                        {complianceStatusLabel(c.status)}
                      </button>
                      <button type="button" onClick={() => void deleteWithUndo({ label: "Item de compliance", remove: () => deletePartyComplianceItem(c.id), restore: async () => { await createPartyComplianceItem(c); }, onChange: reloadCompliance })} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remover">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[7rem_8rem_1fr]">
                      <Select value={c.responsavel ?? "_none"} onValueChange={(v) => patchCompliance(c.id, { responsavel: v === "_none" ? null : v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sem responsável</SelectItem>
                          {COMPLIANCE_RESPONSAVEIS.map((r) => (<SelectItem key={r} value={r}>{complianceResponsavelLabel(r)}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        className={cn("h-7 text-xs", urgencyClass(u))}
                        value={c.due_date ?? ""}
                        onChange={(e) => patchCompliance(c.id, { due_date: e.target.value || null })}
                      />
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-xs"
                        placeholder="Valor R$ (opcional)"
                        defaultValue={c.valor ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value ? Number(e.target.value) : null;
                          if (v !== (c.valor ?? null)) patchCompliance(c.id, { valor: v });
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nenhuma formalidade ainda.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {naCompliance.length > 0 && (
              <button type="button" onClick={() => setShowNa((s) => !s)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {showNa ? "Ocultar N/A" : `+${naCompliance.length} N/A`}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                const pos = compliance.reduce((m, i) => Math.max(m, i.position), -1) + 1;
                await createPartyComplianceItem({
                  party_id: partyId, category: "Outro", title: "Nova formalidade",
                  status: "pendente", protocol: null, due_date: null, notes: null, position: pos,
                  responsavel: null, valor: null,
                });
                reloadCompliance();
              }}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> item
            </button>
            {compliance.length === 0 && (
              <button type="button" onClick={() => void seedDefaultCompliance(partyId).then(reloadCompliance)} className="text-[11px] text-primary hover:underline">
                usar itens padrão
              </button>
            )}
          </div>
        </div>
      </EBlockShell>

      {/* ===== RIDER TÉCNICO ===== */}
      <EBlockShell
        title="Rider técnico"
        summary={riderItems.length > 0 ? `${riderItems.length} item(ns)` : "vazio"}
        isOpen={open === "rider"}
        setOpen={() => setOpen("rider")}
      >
        <div className="space-y-2">
          <RiderField label="Equipamentos" value={riderRaw} onChange={(v) => void saveField("rider_tecnico", v)} />
          {riderItems.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button" size="sm" variant="outline" className="h-8"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(riderToText(riderItems, partyTitle, partyDate)); toast.success("Rider copiado"); }
                  catch { toast.error("Não consegui copiar"); }
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
              </Button>
              <Button
                type="button" size="sm" variant="outline" className="h-8"
                onClick={() => void printRiderPdf(riderItems, partyTitle, partyDate).catch((e) => toast.error(`Erro no PDF: ${String(e)}`))}
              >
                <FileDown className="mr-1 h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          )}
        </div>
      </EBlockShell>

      {/* ===== CHECKLIST ===== */}
      <EBlockShell
        title="Checklist operacional"
        summary={checklistItems.length > 0 ? `${checklistDone}/${checklistItems.length}` : "vazio"}
        isOpen={open === "checklist"}
        setOpen={() => setOpen("checklist")}
      >
        <ChecklistField label="Itens" value={checklistRaw} onChange={(v) => void saveField("checklist_operacional", v)} suggestions={CHECKLIST_SUGGESTIONS} />
      </EBlockShell>

      {/* ===== NOTAS ===== */}
      <EBlockShell
        title="Notas"
        summary={stage.notes ? "com notas" : "vazio"}
        isOpen={open === "notas"}
        setOpen={() => setOpen("notas")}
      >
        <Textarea
          rows={3}
          className="text-sm"
          placeholder="Observações desta etapa…"
          defaultValue={stage.notes ?? ""}
          onBlur={(e) => { if ((e.target.value.trim() || null) !== (stage.notes ?? null)) void saveNotes(e.target.value); }}
        />
      </EBlockShell>
    </div>
  );
}

function confirmStatusChipLabel(s: ConfirmStatus): string {
  return s === "confirmado" ? "Confirmado" : s === "cancelado" ? "Cancelado" : "Pendente";
}

/** Grupo de linhas de confirmação (DJs / Produção / Patrocinadores). */
function ConfirmGroup({ title, rows, onCycleLabel }: { title: string; rows: ConfirmRow[]; onCycleLabel: (s: ConfirmStatus) => string }) {
  if (rows.length === 0) return null;
  const done = rows.filter((r) => r.status === "confirmado").length;
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title} · {done}/{rows.filter((r) => r.status !== "cancelado").length}
      </div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const u = r.status !== "pendente" ? null : urgencyLevel(r.confirmBy, "deadline");
          const wa = waLink(r.phone);
          return (
            <li key={r.key} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm", r.status === "cancelado" && "opacity-60")}>
              <span className="min-w-0 flex-1 truncate">
                {r.name} <span className="text-[11px] text-muted-foreground">· {r.detail}</span>
              </span>
              <button
                type="button"
                onClick={r.onCycle}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  r.status === "confirmado" ? "bg-emerald-500/20 text-emerald-400"
                    : r.status === "cancelado" ? "bg-red-500/15 text-red-400"
                    : "bg-amber-500/20 text-amber-400"
                )}
                title="Alternar status"
              >
                {r.status === "confirmado" && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
                {onCycleLabel(r.status)}
              </button>
              <Input
                type="date"
                className={cn("h-7 w-32 shrink-0 text-xs", urgencyClass(u))}
                value={r.confirmBy ?? ""}
                onChange={(e) => r.onDate(e.target.value || null)}
                title="Confirmar até"
              />
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer" className="shrink-0 text-emerald-500 hover:text-emerald-400" title="WhatsApp">
                  <MessageCircle className="h-4 w-4" />
                </a>
              ) : (
                <span className="shrink-0 text-muted-foreground/40" title="Sem contato cadastrado">
                  <MessageCircle className="h-4 w-4" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Casca de bloco do acordeão — cabeçalho clicável + resumo quando fechado. */
function EBlockShell({
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
      <button type="button" onClick={setOpen} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
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
