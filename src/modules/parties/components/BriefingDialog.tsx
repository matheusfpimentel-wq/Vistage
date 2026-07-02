import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { DEFAULT_STAGE_NAMES } from "../types";
import type {
  PartyBudgetItem,
  PartyDeserialized,
  PartyGuest,
  PartyRunsheetItem,
  PartyStage,
  PartyTicket,
} from "../types";
import { getPartySeries, listPartyGuests, listPartyRunsheet } from "../api";
import {
  BRIEFING_AUDIENCES,
  briefingToMarkdown,
  buildBriefing,
  exportBriefingPdf,
  type BriefingAudience,
} from "../briefing";

/**
 * Briefing por etapa: escolha a etapa e o público (que redige números sensíveis),
 * pré-visualize e exporte — PDF ou markdown pra colar no WhatsApp/e-mail.
 */
export function BriefingDialog({
  open,
  onOpenChange,
  party,
  stages,
  tickets,
  budget,
  lineupNames,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  party: PartyDeserialized;
  stages: PartyStage[];
  tickets: PartyTicket[];
  budget: PartyBudgetItem[];
  lineupNames: string[];
}) {
  const [stageName, setStageName] = useState<string>(DEFAULT_STAGE_NAMES[0]);
  const [audience, setAudience] = useState<BriefingAudience>("interno");
  const [runsheet, setRunsheet] = useState<PartyRunsheetItem[]>([]);
  const [guests, setGuests] = useState<PartyGuest[]>([]);
  const [seriesName, setSeriesName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setRunsheet(await listPartyRunsheet(party.id).catch(() => []));
    setGuests(await listPartyGuests(party.id).catch(() => []));
    if (party.series_id) {
      const s = await getPartySeries(party.series_id).catch(() => null);
      setSeriesName(s?.name ?? null);
    } else {
      setSeriesName(null);
    }
  }, [party.id, party.series_id]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const briefing = useMemo(
    () =>
      buildBriefing(stageName, audience, {
        party,
        stages,
        tickets,
        budget,
        guests,
        runsheet,
        lineupNames,
        seriesName,
      }),
    [stageName, audience, party, stages, tickets, budget, guests, runsheet, lineupNames, seriesName]
  );

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(briefingToMarkdown(briefing));
      toast.success("Briefing copiado (markdown).");
    } catch {
      toast.error("Não consegui copiar.");
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      await exportBriefingPdf(briefing);
    } catch (e) {
      toast.error(`Erro ao exportar: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Briefing por etapa</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={stageName} onValueChange={setStageName}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEFAULT_STAGE_NAMES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={audience} onValueChange={(v) => setAudience(v as BriefingAudience)}>
            <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BRIEFING_AUDIENCES.map((a) => (
                <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            {BRIEFING_AUDIENCES.find((a) => a.key === audience)?.hint}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/20 p-4">
          <div className="text-base font-semibold">{briefing.title}</div>
          <div className="text-xs text-muted-foreground">{briefing.subtitle}</div>
          {briefing.draft && (
            <div className="mt-1 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Rascunho: etapa não concluída
            </div>
          )}
          <div className="mt-3 space-y-3">
            {briefing.sections.map((sec, i) => (
              <div key={i}>
                <div className="text-sm font-semibold">{sec.heading}</div>
                <ul className="ml-4 list-disc text-sm text-muted-foreground">
                  {sec.lines.map((l, j) => (
                    <li key={j}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyMarkdown()}>
            <Copy className="h-4 w-4" /> Copiar markdown
          </Button>
          <Button size="sm" onClick={() => void exportPdf()} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Exportar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
