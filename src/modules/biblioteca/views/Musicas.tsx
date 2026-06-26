import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileAudio2, FolderSearch, Link2, Plus, RefreshCw, Save, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import {
  addManualRow,
  applyScan,
  correlate,
  deleteTrack,
  listTracks,
  scanReconcile,
  updateCell,
  verifyFiles,
  writeTagsToFiles,
  type EditableCol,
  type LibraryTrack,
  type ScanDiff,
} from "../library/api";

const AUDIO_EXTS = ["mp3", "m4a", "aac", "flac", "wav", "aiff", "aif", "ogg"];
const ROW_H = 38;

export function Musicas() {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [includeSubdirs, setIncludeSubdirs] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [diff, setDiff] = useState<ScanDiff | null>(null);
  const [writeProgress, setWriteProgress] = useState<{ done: number; total: number } | null>(null);
  // Linhas editadas nesta sessão (e se o COMENTÁRIO foi tocado) → guiam "Gravar tags".
  const edited = useRef<Set<number>>(new Set());
  const commentEdited = useRef<Set<number>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTracks(await listTracks());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((t) =>
      [t.title, t.artist, t.genre, t.music_key, t.comments].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [tracks, filter]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  function patchLocal(id: number, patch: Partial<LibraryTrack>) {
    setTracks((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveCell(id: number, col: EditableCol, value: string) {
    await updateCell(id, col, value);
    edited.current.add(id);
    if (col === "comments") commentEdited.current.add(id);
    patchLocal(id, { [col]: col === "bpm" ? (value ? parseFloat(value.replace(",", ".")) : null) : value || null } as Partial<LibraryTrack>);
  }

  async function pickFolderAndScan() {
    const folder = await openDialog({ directory: true, multiple: false, title: "Escanear pasta de músicas" });
    if (!folder || typeof folder !== "string") return;
    setScanning(true);
    try {
      const d = await scanReconcile(folder, includeSubdirs);
      setDiff(d);
    } catch (e) {
      toast.error("Falha ao escanear: " + String(e));
    } finally {
      setScanning(false);
    }
  }

  async function confirmApplyScan() {
    if (!diff) return;
    await applyScan(diff);
    const n = diff.newTracks.length, m = diff.moved.length;
    setDiff(null);
    toast.success(`${n} nova(s), ${m} recolocada(s).`);
    void refresh();
  }

  async function doCorrelate(id: number) {
    const file = await openDialog({
      multiple: false,
      title: "Apontar o arquivo desta faixa",
      filters: [{ name: "Áudio", extensions: AUDIO_EXTS }],
    });
    if (!file || typeof file !== "string") return;
    await correlate(id, file);
    void refresh();
  }

  async function doVerify() {
    const { missing } = await verifyFiles();
    toast[missing > 0 ? "warning" : "success"](
      missing > 0 ? `${missing} arquivo(s) ausente(s).` : "Todos os arquivos no lugar."
    );
    void refresh();
  }

  async function doWriteTags() {
    const ids = [...edited.current].filter((id) => {
      const t = tracks.find((x) => x.id === id);
      return t && t.file_path && !t.file_missing;
    });
    if (ids.length === 0) {
      toast.info("Nenhuma linha correlacionada foi editada nesta sessão.");
      return;
    }
    const anyComment = ids.some((id) => commentEdited.current.has(id));
    const ok = await confirmDialog({
      title: "Gravar tags nos arquivos",
      description:
        `Isto MODIFICA ${ids.length} arquivo(s) de áudio reais (ação física).` +
        (anyComment
          ? " Inclui o campo Comentário — isto sobrescreve o comentário do arquivo, que o Rekordbox/Serato podem usar."
          : "") +
        " O Rekordbox/Serato só veem as novas tags após reanalisar.",
      confirmLabel: "Gravar",
      destructive: anyComment,
    });
    if (!ok) return;
    setWriteProgress({ done: 0, total: ids.length });
    const res = await writeTagsToFiles(ids, anyComment, (done, total) => setWriteProgress({ done, total }));
    setWriteProgress(null);
    edited.current.clear();
    commentEdited.current.clear();
    if (res.failed.length === 0) {
      toast.success(`${res.ok} arquivo(s) gravado(s) e verificado(s).`);
    } else {
      toast.warning(`${res.ok} OK, ${res.failed.length} falharam (travado/permissão/ausente).`);
    }
  }

  async function doDelete(t: LibraryTrack) {
    if (!(await confirmDialog({ title: "Excluir faixa", description: `Excluir "${t.title || t.file_path || "faixa"}" da biblioteca?`, confirmLabel: "Excluir", destructive: true }))) return;
    const r = await deleteTrack(t.id);
    toast.success(r === "archived" ? "Arquivada (segue no setlist da GIG que a usou)." : "Excluída.");
    void refresh();
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void pickFolderAndScan()} disabled={scanning}>
          <FolderSearch className="mr-1.5 h-4 w-4" /> {scanning ? "Escaneando…" : "Escanear pasta"}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeSubdirs} onChange={(e) => setIncludeSubdirs(e.target.checked)} />
          incluir subpastas
        </label>
        <Button size="sm" variant="outline" onClick={() => void addManualRow().then(refresh)}>
          <Plus className="mr-1.5 h-4 w-4" /> Adicionar linha
        </Button>
        <Button size="sm" variant="outline" onClick={() => void doVerify()}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Verificar arquivos
        </Button>
        <Button size="sm" variant="outline" onClick={() => void doWriteTags()}>
          <Save className="mr-1.5 h-4 w-4" /> Gravar tags nos arquivos
        </Button>
        <input
          className="ml-auto h-8 w-48 rounded-md border bg-background px-2 text-sm"
          placeholder="Filtrar…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Editar a grade muda o banco (salva no <strong>Ctrl+S</strong>). <strong>Gravar tags</strong> mexe nos arquivos de áudio. WAV/AIFF têm suporte de tag parcial.
      </p>

      {writeProgress && (
        <div className="text-xs text-muted-foreground">Gravando {writeProgress.done}/{writeProgress.total}…</div>
      )}

      {/* Cabeçalho da grade */}
      <div className="overflow-hidden rounded-md border">
        <div className="grid-music grid-music-head">
          <span>Correl.</span><span>Título</span><span>Artista</span><span>Gênero</span>
          <span>BPM</span><span>Tom</span><span>Comentários</span><span>Status</span><span />
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <FileAudio2 className="mx-auto mb-2 h-7 w-7 opacity-50" />
            Nenhuma faixa. Escaneie uma pasta ou adicione uma linha.
          </div>
        ) : (
          <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: "62vh" }}>
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const t = filtered[vi.index];
                return (
                  <div
                    key={t.id}
                    className={cn("grid-music grid-music-row", t.file_missing && "is-missing")}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: ROW_H, transform: `translateY(${vi.start}px)` }}
                  >
                    {/* Correlação */}
                    <span className="corr">
                      {t.file_path ? (
                        t.file_missing ? (
                          <button title="Arquivo ausente — recorrelacionar" onClick={() => void doCorrelate(t.id)} className="text-destructive">
                            <TriangleAlert className="h-4 w-4" />
                          </button>
                        ) : (
                          <span title={t.file_path} className="text-emerald-500">✓</span>
                        )
                      ) : (
                        <button title="Sem correlação — apontar arquivo" onClick={() => void doCorrelate(t.id)} className="text-muted-foreground hover:text-foreground">
                          <Link2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                    <Cell t={t} col="title" onSave={saveCell} />
                    <Cell t={t} col="artist" onSave={saveCell} />
                    <Cell t={t} col="genre" onSave={saveCell} />
                    <Cell t={t} col="bpm" onSave={saveCell} numeric />
                    <Cell t={t} col="music_key" onSave={saveCell} />
                    <Cell t={t} col="comments" onSave={saveCell} />
                    <span className={cn("status", t.file_missing && "text-destructive")}>
                      {t.file_path ? (t.file_missing ? "ausente" : "ok") : "—"}
                    </span>
                    <button className="del" title="Excluir" onClick={() => void doDelete(t)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Resumo do rescan antes de aplicar */}
      {diff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDiff(null)}>
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold">Resultado do scan</h3>
            <ul className="space-y-1 text-sm">
              <li>{diff.scannedCount} arquivo(s) lidos</li>
              <li className="text-emerald-500">{diff.newTracks.length} nova(s)</li>
              <li className="text-sky-500">{diff.moved.length} recolocada(s) (arquivo movido)</li>
              <li className="text-amber-500">{diff.missing.length} ausente(s) na pasta (mantidas)</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDiff(null)}>Cancelar</Button>
              <Button size="sm" onClick={() => void confirmApplyScan()}>Aplicar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({
  t,
  col,
  onSave,
  numeric,
}: {
  t: LibraryTrack;
  col: EditableCol;
  onSave: (id: number, col: EditableCol, v: string) => void;
  numeric?: boolean;
}) {
  const raw = t[col];
  const initial = raw == null ? "" : String(raw);
  return (
    <input
      // key inclui o valor pra re-hidratar ao voltar do virtualizador
      key={`${t.id}:${col}:${initial}`}
      defaultValue={initial}
      inputMode={numeric ? "decimal" : undefined}
      className="cell-input"
      onBlur={(e) => {
        if (e.target.value !== initial) onSave(t.id, col, e.target.value);
      }}
    />
  );
}
