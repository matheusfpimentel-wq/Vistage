import { useCallback, useEffect, useState } from "react";
import { GitFork, Layers, Loader2, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { EMPTY_VALUE, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PartySeries } from "../types";
import {
  createEdition,
  getPartySeries,
  listPartySeries,
  seriesRollup,
  transformPartyIntoSeries,
  updateParty,
  type CloneScaffoldOptions,
  type SeriesRollup,
} from "../api";

const CLONE_FIELDS: { key: keyof CloneScaffoldOptions; label: string }[] = [
  { key: "lineup", label: "Line-up" },
  { key: "team", label: "Equipe" },
  { key: "sponsors", label: "Patrocinadores" },
  { key: "tickets", label: "Ingressos / lotes" },
  { key: "budget", label: "Orçamento (projetado)" },
  { key: "runsheet", label: "Run-of-show" },
];

/**
 * Série / Edição na aba Info. Festa avulsa → vincular a uma série ou transformar
 * nesta a 1ª edição. Edição → rótulo/número, roll-up da franquia e "Nova edição"
 * (clona o ANDAIME da edição mais recente, sem os resultados).
 *
 * Mantém o series_id em estado local pra ficar reativo após transformar/vincular
 * sem depender de o formulário recarregar o prop.
 */
export function SeriesEditionCard({
  partyId,
  seriesId: seriesIdProp,
  editionLabel,
  editionNumber: editionNumberProp,
  partyTitle,
}: {
  partyId: number;
  seriesId: number | null;
  editionLabel: string | null;
  editionNumber: number | null;
  partyTitle: string;
}) {
  const [sid, setSid] = useState<number | null>(seriesIdProp);
  const [editNum, setEditNum] = useState<number | null>(editionNumberProp);
  const [seriesList, setSeriesList] = useState<PartySeries[]>([]);
  const [series, setSeries] = useState<PartySeries | null>(null);
  const [rollup, setRollup] = useState<SeriesRollup | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(editionLabel ?? "");
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [clone, setClone] = useState<CloneScaffoldOptions>({
    lineup: true, team: true, sponsors: true, tickets: true, budget: true, runsheet: true,
  });

  const reload = useCallback(async () => {
    setSeriesList(await listPartySeries());
    if (sid) {
      setSeries(await getPartySeries(sid));
      setRollup(await seriesRollup(sid));
    } else {
      setSeries(null);
      setRollup(null);
    }
  }, [sid]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function linkTo(id: number) {
    setBusy(true);
    try {
      const r = await seriesRollup(id);
      const next = r.editions.reduce((m, e) => Math.max(m, e.number ?? 0), 0) + 1;
      await updateParty({ id: partyId, series_id: id, edition_number: next, edition_label: `Edição ${next}` });
      setSid(id);
      setEditNum(next);
      setLabel(`Edição ${next}`);
      toast.success("Festa vinculada à série.");
    } finally {
      setBusy(false);
    }
  }

  async function transform() {
    setBusy(true);
    try {
      const newSeriesId = await transformPartyIntoSeries(partyId, partyTitle);
      setSid(newSeriesId);
      setEditNum(1);
      toast.success("Série criada — esta festa virou a edição 1.");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await updateParty({ id: partyId, series_id: null });
      setSid(null);
      toast.success("Festa desvinculada da série.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLabel() {
    await updateParty({ id: partyId, edition_label: label.trim() || null });
  }

  async function makeEdition() {
    if (!sid) return;
    setBusy(true);
    try {
      await createEdition(sid, { editionLabel: newLabel.trim() || null, clone });
      toast.success("Nova edição criada (andaime clonado, sem os resultados).");
      setShowNew(false);
      setNewLabel("");
      await reload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!sid) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Layers className="h-4 w-4" /> Série / Edição
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {seriesList.length > 0 && (
            <Select onValueChange={(v) => void linkTo(Number(v))}>
              <SelectTrigger className="h-8 w-48 text-sm">
                <SelectValue placeholder="Vincular a uma série…" />
              </SelectTrigger>
              <SelectContent>
                {seriesList.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => void transform()} disabled={busy}>
            <GitFork className="h-4 w-4" /> Transformar em série
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <Layers className="h-4 w-4 shrink-0" />
          <span className="truncate">{series?.name ?? "Série"}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs text-muted-foreground" onClick={() => void unlink()} disabled={busy}>
          <Unlink className="h-3.5 w-3.5" /> Desvincular
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Edição (rótulo)</label>
          <Input
            className="h-8 w-40 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => void saveLabel()}
            placeholder="Vol. 2"
          />
        </div>
        <div className="pb-1.5 text-xs text-muted-foreground">nº {editNum ?? EMPTY_VALUE}</div>
      </div>

      {rollup && rollup.editionsCount > 0 && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Edições" value={String(rollup.editionsCount)} />
            <Stat label="Público médio" value={rollup.avgAttendance ? String(rollup.avgAttendance) : EMPTY_VALUE} />
            <Stat
              label="Retenção"
              value={rollup.avgRetentionPct != null ? `${rollup.avgRetentionPct}%` : EMPTY_VALUE}
            />
            <Stat label="Lucro total" value={formatCurrency(rollup.totalNet)} />
          </div>
          <ul className="space-y-1">
            {rollup.editions.map((e) => (
              <li
                key={e.id}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-xs",
                  e.id === partyId ? "bg-primary/10" : "bg-muted/30"
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {e.number ? `#${e.number} · ` : ""}{e.title}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {e.attendance != null ? `${e.attendance} pess.` : EMPTY_VALUE}
                </span>
                {e.attendanceRetentionPct != null && (
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      e.attendanceRetentionPct >= 100 ? "text-emerald-500" : "text-amber-500"
                    )}
                    title="Retenção de público vs edição anterior"
                  >
                    {e.attendanceRetentionPct >= 100 ? "↑" : "↓"}{e.attendanceRetentionPct}%
                  </span>
                )}
                <span className={cn("shrink-0 tabular-nums", e.net >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {formatCurrency(e.net)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNew ? (
        <div className="space-y-2 rounded-md border p-2">
          <div className="text-xs font-medium">Nova edição — o que trazer do andaime?</div>
          <div className="grid grid-cols-2 gap-1">
            {CLONE_FIELDS.map(({ key, label: l }) => (
              <label key={key} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={clone[key]}
                  onChange={(e) => setClone((c) => ({ ...c, [key]: e.target.checked }))}
                />
                {l}
              </label>
            ))}
          </div>
          <Input
            className="h-8 text-sm"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Rótulo da edição (ex.: Vol. 3)"
          />
          <p className="text-[11px] text-muted-foreground">
            Clona o "como fazer". Vendas, público real e valores pagos <strong>não</strong> vêm.
          </p>
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => void makeEdition()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar edição
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> Nova edição
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-2 py-1.5 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
