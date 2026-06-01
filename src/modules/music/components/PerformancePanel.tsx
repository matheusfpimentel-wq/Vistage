import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { deleteSnapshot, listTrackSnapshots, upsertSnapshot } from "../api";
import type { SnapshotData, TrackPerformanceSnapshot } from "../types";

type Props = {
  trackId: number;
};

function formatPeriod(p: string): string {
  const [y, m] = p.split("-");
  const months = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  return `${months[Number(m) - 1]}/${y}`;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseSnapshotData(raw: string | null): SnapshotData {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SnapshotData;
  } catch {
    return {};
  }
}

const EMPTY_FORM: {
  period: string;
  streams: string;
  saves: string;
  shares: string;
  playlist_adds: string;
  revenue_cents: string;
  notes: string;
} = {
  period: "",
  streams: "",
  saves: "",
  shares: "",
  playlist_adds: "",
  revenue_cents: "",
  notes: "",
};

export function PerformancePanel({ trackId }: Props) {
  const [snapshots, setSnapshots] = useState<TrackPerformanceSnapshot[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listTrackSnapshots(trackId);
    setSnapshots(list);
  }, [trackId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function loadIntoForm(s: TrackPerformanceSnapshot) {
    const d = parseSnapshotData(s.data);
    const [y, m] = s.period_yyyymm.split(/(?<=^\d{4})(?=\d{2})/);
    setForm({
      period: `${y}-${m}`,
      streams: d.streams?.toString() ?? "",
      saves: d.saves?.toString() ?? "",
      shares: d.shares?.toString() ?? "",
      playlist_adds: d.playlist_adds?.toString() ?? "",
      revenue_cents: d.revenue_cents?.toString() ?? "",
      notes: d.notes ?? "",
    });
  }

  async function handleSave() {
    if (!form.period) {
      toast.error("Período é obrigatório");
      return;
    }
    const period = form.period.replace("-", "");
    const data: SnapshotData = {
      streams: form.streams ? Number(form.streams) : undefined,
      saves: form.saves ? Number(form.saves) : undefined,
      shares: form.shares ? Number(form.shares) : undefined,
      playlist_adds: form.playlist_adds ? Number(form.playlist_adds) : undefined,
      revenue_cents: form.revenue_cents ? Number(form.revenue_cents) : undefined,
      notes: form.notes.trim() || undefined,
    };
    setSaving(true);
    try {
      await upsertSnapshot(trackId, period, data);
      setForm({ ...EMPTY_FORM });
      toast.success("Snapshot salvo");
      await refresh();
    } catch {
      toast.error("Erro ao salvar snapshot");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteSnapshot(id);
    await refresh();
  }

  const chartSnapshots = snapshots.slice(0, 6);
  const maxStreams = Math.max(
    1,
    ...chartSnapshots.map((s) => parseSnapshotData(s.data).streams ?? 0)
  );

  return (
    <div className="space-y-5">
      {snapshots.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            Streams por período
          </div>
          <div className="space-y-1">
            {chartSnapshots.map((s) => {
              const d = parseSnapshotData(s.data);
              const streams = d.streams ?? 0;
              const pct = (streams / maxStreams) * 100;
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-right text-muted-foreground">
                    {formatPeriod(
                      `${s.period_yyyymm.slice(0, 4)}-${s.period_yyyymm.slice(4)}`
                    )}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                    <div
                      className="h-full rounded-sm bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-14 text-muted-foreground">
                    {streams.toLocaleString("pt-BR")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {snapshots.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">
              Histórico
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY_FORM })}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Novo
            </button>
          </div>
          {snapshots.map((s) => {
            const d = parseSnapshotData(s.data);
            const periodFormatted = formatPeriod(
              `${s.period_yyyymm.slice(0, 4)}-${s.period_yyyymm.slice(4)}`
            );
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
              >
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="font-medium">{periodFormatted}</span>
                  {d.streams != null && (
                    <span className="text-muted-foreground">
                      {d.streams.toLocaleString("pt-BR")} streams
                    </span>
                  )}
                  {d.saves != null && (
                    <span className="text-muted-foreground">
                      {d.saves.toLocaleString("pt-BR")} saves
                    </span>
                  )}
                  {d.shares != null && (
                    <span className="text-muted-foreground">
                      {d.shares.toLocaleString("pt-BR")} shares
                    </span>
                  )}
                  {d.playlist_adds != null && (
                    <span className="text-muted-foreground">
                      {d.playlist_adds.toLocaleString("pt-BR")} playlists
                    </span>
                  )}
                  {d.revenue_cents != null && (
                    <span className="text-muted-foreground">
                      {formatBRL(d.revenue_cents / 100)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => loadIntoForm(s)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={cn("space-y-3 rounded-md border p-3")}>
        <div className="text-xs font-medium">
          {form.period && snapshots.some(
            (s) => `${s.period_yyyymm.slice(0, 4)}-${s.period_yyyymm.slice(4)}` === form.period
          )
            ? "Editar snapshot"
            : "Novo snapshot"}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label className="text-xs">Período</Label>
            <Input
              type="month"
              value={form.period}
              onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Streams</Label>
            <Input
              type="number"
              min={0}
              value={form.streams}
              onChange={(e) => setForm((f) => ({ ...f, streams: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Saves</Label>
            <Input
              type="number"
              min={0}
              value={form.saves}
              onChange={(e) => setForm((f) => ({ ...f, saves: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Shares</Label>
            <Input
              type="number"
              min={0}
              value={form.shares}
              onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Playlist adds</Label>
            <Input
              type="number"
              min={0}
              value={form.playlist_adds}
              onChange={(e) =>
                setForm((f) => ({ ...f, playlist_adds: e.target.value }))
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Receita (centavos)</Label>
            <Input
              type="number"
              min={0}
              value={form.revenue_cents}
              onChange={(e) =>
                setForm((f) => ({ ...f, revenue_cents: e.target.value }))
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
