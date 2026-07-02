import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { EMPTY_VALUE, todayISO, formatDate } from "@/lib/format";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  addContentSnapshot,
  deleteContentSnapshot,
  listContentSnapshots,
} from "../api";
import type { ContentSnapshot } from "../types";

type Props = {
  contentId: number;
  title: string;
};

type Draft = {
  captured_at: string;
  views: string;
  likes: string;
  comments: string;
  shares: string;
  saves: string;
};

const EMPTY_DRAFT: Draft = {
  captured_at: todayISO(),
  views: "",
  likes: "",
  comments: "",
  shares: "",
  saves: "",
};

function num(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function ContentSnapshots({ contentId, title }: Props) {
  const [snapshots, setSnapshots] = useState<ContentSnapshot[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshots(await listContentSnapshots(contentId));
  }, [contentId]);

  useEffect(() => {
    void refresh();
    setDraft({ ...EMPTY_DRAFT, captured_at: todayISO() });
  }, [refresh]);

  async function handleAdd() {
    if (!draft.captured_at) {
      toast.error("Informe a data da captura");
      return;
    }
    setSaving(true);
    try {
      await addContentSnapshot({
        content_id: contentId,
        captured_at: draft.captured_at,
        metric_views: num(draft.views),
        metric_likes: num(draft.likes),
        metric_comments: num(draft.comments),
        metric_shares: num(draft.shares),
        metric_saves: num(draft.saves),
      });
      toast.success("Captura registrada");
      setDraft({ ...EMPTY_DRAFT, captured_at: todayISO() });
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (
      !(await confirmDialog({
        title: "Excluir captura",
        description: "Remover este retrato de métricas?",
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteContentSnapshot(id);
    await refresh();
  }

  async function handleExportCsv() {
    if (snapshots.length === 0) {
      toast.error("Nenhuma captura para exportar");
      return;
    }
    const header = ["captured_at", "views", "likes", "comments", "shares", "saves"];
    const lines = [header.join(",")];
    for (const s of snapshots) {
      lines.push(
        [
          s.captured_at,
          s.metric_views ?? "",
          s.metric_likes ?? "",
          s.metric_comments ?? "",
          s.metric_shares ?? "",
          s.metric_saves ?? "",
        ].join(",")
      );
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "conteudo";
    const path = await saveDialog({
      title: "Exportar capturas em CSV",
      defaultPath: `vistage-metricas-${slug}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    await writeTextFile(path, lines.join("\n"));
    toast.success("CSV exportado");
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Cada captura é um retrato das métricas num dado momento. Registre
        capturas em datas diferentes para acompanhar a evolução.
      </p>

      {/* nova captura */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Data da captura</Label>
            <Input
              type="date"
              className="h-8"
              value={draft.captured_at}
              onChange={(e) => setDraft((d) => ({ ...d, captured_at: e.target.value }))}
            />
          </div>
          {(
            [
              ["views", "Views"],
              ["likes", "Curtidas"],
              ["comments", "Coment."],
              ["shares", "Compart."],
              ["saves", "Salvos"],
            ] as [keyof Draft, string][]
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                className="h-8"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Registrar captura
        </Button>
      </div>

      {/* histórico */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">Histórico de capturas</Label>
        <Button type="button" size="sm" variant="outline" onClick={handleExportCsv}>
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>
      {snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma captura ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Data</th>
                <th className="px-2 py-1.5 text-right">Views</th>
                <th className="px-2 py-1.5 text-right">Curtidas</th>
                <th className="px-2 py-1.5 text-right">Coment.</th>
                <th className="px-2 py-1.5 text-right">Compart.</th>
                <th className="px-2 py-1.5 text-right">Salvos</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-2 py-1.5 tabular-nums">{formatDate(s.captured_at)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.metric_views ?? EMPTY_VALUE}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.metric_likes ?? EMPTY_VALUE}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.metric_comments ?? EMPTY_VALUE}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.metric_shares ?? EMPTY_VALUE}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.metric_saves ?? EMPTY_VALUE}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Excluir captura"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
