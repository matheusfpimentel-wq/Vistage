import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  FileAudio2,
  FolderSearch,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
  updateCell,
  verifyFiles,
  writeTagsToFiles,
  type EditableCol,
  type LibraryTrack,
} from "../library/api";
import { useScanManager } from "../library/scanManager";

const AUDIO_EXTS = ["mp3", "m4a", "aac", "flac", "wav", "aiff", "aif", "ogg"];
const ROW_H = 38;

// ── Colunas configuráveis (ordenar/arrastar/mostrar-ocultar) ──────────────────
type ColDef = {
  id: string;
  label: string;
  width: string; // trilha do CSS grid
  sortKey: keyof LibraryTrack;
  editable?: EditableCol;
  numeric?: boolean;
};

const ALL_COLS: ColDef[] = [
  { id: "title", label: "Título", width: "minmax(0, 1.5fr)", sortKey: "title", editable: "title" },
  { id: "artist", label: "Artista", width: "minmax(0, 1.3fr)", sortKey: "artist", editable: "artist" },
  { id: "genre", label: "Gênero", width: "minmax(0, 1fr)", sortKey: "genre", editable: "genre" },
  { id: "bpm", label: "BPM", width: "72px", sortKey: "bpm", editable: "bpm", numeric: true },
  { id: "music_key", label: "Tom", width: "80px", sortKey: "music_key", editable: "music_key" },
  { id: "comments", label: "Comentários", width: "minmax(0, 1.6fr)", sortKey: "comments", editable: "comments" },
  { id: "duration_sec", label: "Duração", width: "84px", sortKey: "duration_sec", numeric: true },
  { id: "source", label: "Origem", width: "88px", sortKey: "source" },
  { id: "status", label: "Status", width: "80px", sortKey: "file_missing" },
];
const COL_BY_ID = Object.fromEntries(ALL_COLS.map((c) => [c.id, c])) as Record<string, ColDef>;
// Campo PRINCIPAL travado (não arrastável, posição fixa) — consistente com as
// outras tabelas. Só as colunas do meio reordenam entre si.
const LOCKED_COL_ID = "title";

const COLS_LS = "vistage.biblioteca.musicas.cols.v1";
type SortState = { id: string; dir: "asc" | "desc" } | null;
type ColPrefs = { order: string[]; hidden: string[]; sort: SortState };

const DEFAULT_PREFS: ColPrefs = {
  order: ALL_COLS.map((c) => c.id),
  hidden: ["duration_sec", "source"],
  sort: null,
};

function loadPrefs(): ColPrefs {
  try {
    const raw = localStorage.getItem(COLS_LS);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<ColPrefs>;
    // sanitiza: mantém só ids conhecidos e garante que todas as colunas existam
    const known = new Set(ALL_COLS.map((c) => c.id));
    const order = (p.order ?? []).filter((id) => known.has(id));
    for (const c of ALL_COLS) if (!order.includes(c.id)) order.push(c.id);
    return {
      order,
      hidden: (p.hidden ?? []).filter((id) => known.has(id)),
      sort: p.sort && known.has(p.sort.id) ? p.sort : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function fmtDuration(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function compareTracks(a: LibraryTrack, b: LibraryTrack, key: keyof LibraryTrack, dir: "asc" | "desc"): number {
  const av = a[key];
  const bv = b[key];
  const an = av == null || av === "";
  const bn = bv == null || bv === "";
  if (an && bn) return 0;
  if (an) return 1; // nulos sempre por último
  if (bn) return -1;
  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base", numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

export function Musicas() {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [includeSubdirs, setIncludeSubdirs] = useState(true);
  // Varredura: estado vem do gerenciador SINGLETON (nível de módulo), não local —
  // assim continua rodando e mantém o resultado ao sair/voltar da Biblioteca.
  const scanStatus = useScanManager((s) => s.status);
  const scanScanned = useScanManager((s) => s.scanned);
  const diff = useScanManager((s) => s.diff);
  const startScan = useScanManager((s) => s.startScan);
  const resetScan = useScanManager((s) => s.reset);
  const scanning = scanStatus === "scanning" || scanStatus === "reconciling";
  const [writeProgress, setWriteProgress] = useState<{ done: number; total: number } | null>(null);
  const [prefs, setPrefs] = useState<ColPrefs>(loadPrefs);
  const [colMenu, setColMenu] = useState(false);
  // Bump quando uma gravação de célula falha: força a célula (input não-controlado)
  // a re-hidratar com o valor real do banco, em vez de manter o texto que não salvou.
  const [cellRev, setCellRev] = useState(0);
  // Linhas editadas nesta sessão (e se o COMENTÁRIO foi tocado) → guiam "Gravar tags".
  const edited = useRef<Set<number>>(new Set());
  const commentEdited = useRef<Set<number>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listTracks();
      // Commit não-urgente: em bibliotecas grandes evita travar a UV ao montar.
      startTransition(() => setTracks(rows));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function persistPrefs(next: ColPrefs) {
    setPrefs(next);
    try {
      localStorage.setItem(COLS_LS, JSON.stringify(next));
    } catch {
      /* ignora cota */
    }
  }

  const visibleCols = useMemo(
    () => prefs.order.map((id) => COL_BY_ID[id]).filter((c): c is ColDef => !!c && !prefs.hidden.includes(c.id)),
    [prefs]
  );

  const gridTemplate = useMemo(
    () => `48px ${visibleCols.map((c) => c.width).join(" ")} 36px`,
    [visibleCols]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let rows = tracks;
    if (q) {
      rows = rows.filter((t) =>
        [t.title, t.artist, t.genre, t.music_key, t.comments].some((v) => (v ?? "").toLowerCase().includes(q))
      );
    }
    if (prefs.sort) {
      const col = COL_BY_ID[prefs.sort.id];
      if (col) {
        const dir = prefs.sort.dir;
        rows = [...rows].sort((a, b) => compareTracks(a, b, col.sortKey, dir));
      }
    }
    return rows;
  }, [tracks, filter, prefs.sort]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onHeaderClick(col: ColDef) {
    persistPrefs({
      ...prefs,
      sort:
        prefs.sort?.id !== col.id
          ? { id: col.id, dir: "asc" }
          : prefs.sort.dir === "asc"
          ? { id: col.id, dir: "desc" }
          : null, // 3º clique remove a ordenação
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // "title" é o campo PRINCIPAL: travado, posição fixa. Não pode ser arrastado
    // nem ter algo solto na sua posição (mantém ancorado no índice 0).
    if (active.id === LOCKED_COL_ID || over.id === LOCKED_COL_ID) return;
    const oldIndex = prefs.order.indexOf(String(active.id));
    const newIndex = prefs.order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    persistPrefs({ ...prefs, order: arrayMove(prefs.order, oldIndex, newIndex) });
  }

  function toggleHidden(id: string) {
    const hidden = prefs.hidden.includes(id)
      ? prefs.hidden.filter((x) => x !== id)
      : [...prefs.hidden, id];
    persistPrefs({ ...prefs, hidden });
  }

  function patchLocal(id: number, patch: Partial<LibraryTrack>) {
    setTracks((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveCell(id: number, col: EditableCol, value: string) {
    try {
      await updateCell(id, col, value);
    } catch (e) {
      toast.error(`Não consegui salvar a alteração: ${String(e)}`);
      setCellRev((n) => n + 1); // re-hidrata a célula com o valor do banco
      return;
    }
    edited.current.add(id);
    if (col === "comments") commentEdited.current.add(id);
    patchLocal(id, { [col]: col === "bpm" ? (value ? parseFloat(value.replace(",", ".")) : null) : value || null } as Partial<LibraryTrack>);
  }

  async function pickFolderAndScan() {
    const folder = await openDialog({ directory: true, multiple: false, title: "Escanear pasta de músicas" });
    if (!folder || typeof folder !== "string") return;
    // Dispara a varredura no gerenciador de fundo e retorna na hora: a varredura
    // segue no Rust e o resultado (diff) chega via estado do gerenciador — mesmo
    // que esta tela seja desmontada no meio.
    void startScan(folder, includeSubdirs);
  }

  // Erro da varredura: mostra um toast (uma vez) e limpa o estado do gerenciador.
  useEffect(() => {
    if (scanStatus === "error") {
      toast.error("Falha ao escanear: " + String(useScanManager.getState().error));
      resetScan();
    }
  }, [scanStatus, resetScan]);

  async function confirmApplyScan() {
    if (!diff) return;
    await applyScan(diff);
    const n = diff.newTracks.length, m = diff.moved.length;
    resetScan();
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
          <FolderSearch className="mr-1.5 h-4 w-4" />{" "}
          {scanStatus === "scanning"
            ? `Escaneando… (${scanScanned})`
            : scanStatus === "reconciling"
            ? "Reconciliando…"
            : "Escanear pasta"}
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

        {/* Seletor de colunas */}
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setColMenu((v) => !v)}>
            <Columns3 className="mr-1.5 h-4 w-4" /> Colunas
          </Button>
          {colMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColMenu(false)} />
              <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                {prefs.order.map((id) => {
                  const c = COL_BY_ID[id];
                  if (!c) return null;
                  const shown = !prefs.hidden.includes(id);
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                      <input type="checkbox" className="accent-primary" checked={shown} onChange={() => toggleHidden(id)} />
                      {c.label}
                    </label>
                  );
                })}
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">Arraste o cabeçalho pra reordenar. Clique pra ordenar.</p>
              </div>
            </>
          )}
        </div>

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

      {scanStatus === "scanning" && (
        <div className="text-xs text-muted-foreground">
          Escaneando em segundo plano… {scanScanned} arquivo(s) lidos. Pode navegar — continua rodando.
        </div>
      )}
      {scanStatus === "reconciling" && (
        <div className="text-xs text-muted-foreground">Reconciliando com a biblioteca…</div>
      )}

      {/* Cabeçalho da grade (arrastável + ordenável) */}
      <div className="overflow-hidden rounded-md border">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="grid-music grid-music-head" style={{ gridTemplateColumns: gridTemplate }}>
            <span>Correl.</span>
            <SortableContext items={visibleCols.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {visibleCols.map((c) => (
                <HeaderCell
                  key={c.id}
                  col={c}
                  locked={c.id === LOCKED_COL_ID}
                  dir={prefs.sort?.id === c.id ? prefs.sort.dir : null}
                  onClick={() => onHeaderClick(c)}
                />
              ))}
            </SortableContext>
            <span />
          </div>
        </DndContext>

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
                    style={{ gridTemplateColumns: gridTemplate, position: "absolute", top: 0, left: 0, width: "100%", height: ROW_H, transform: `translateY(${vi.start}px)` }}
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

                    {visibleCols.map((c) =>
                      c.editable ? (
                        <Cell key={c.id} t={t} col={c.editable} onSave={saveCell} numeric={c.numeric} rev={cellRev} />
                      ) : c.id === "status" ? (
                        <span key={c.id} className={cn("status", t.file_missing && "text-destructive")}>
                          {t.file_path ? (t.file_missing ? "ausente" : "ok") : "—"}
                        </span>
                      ) : c.id === "duration_sec" ? (
                        <span key={c.id} className="status">{fmtDuration(t.duration_sec)}</span>
                      ) : c.id === "source" ? (
                        <span key={c.id} className="status">{t.source === "manual" ? "Manual" : "Pasta"}</span>
                      ) : (
                        <span key={c.id} className="status" />
                      )
                    )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => resetScan()}>
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold">Resultado do scan</h3>
            <ul className="space-y-1 text-sm">
              <li>{diff.scannedCount} arquivo(s) lidos</li>
              <li className="text-emerald-500">{diff.newTracks.length} nova(s)</li>
              <li className="text-sky-500">{diff.moved.length} recolocada(s) (arquivo movido)</li>
              <li className="text-amber-500">{diff.missing.length} ausente(s) na pasta (mantidas)</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => resetScan()}>Cancelar</Button>
              <Button size="sm" onClick={() => void confirmApplyScan()}>Aplicar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderCell({ col, locked, dir, onClick }: { col: ColDef; locked?: boolean; dir: "asc" | "desc" | null; onClick: () => void }) {
  // Travada (campo principal): mantém a ordenação por clique, mas sem os
  // listeners de arrasto — fica ancorada na posição.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id, disabled: locked });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...(locked ? {} : listeners)}
      onClick={onClick}
      className="flex cursor-pointer select-none items-center gap-1 hover:text-foreground"
      title={locked ? "Clique pra ordenar" : "Clique pra ordenar · arraste pra reposicionar"}
    >
      {col.label}
      {dir === "asc" ? <ChevronUp className="h-3 w-3" /> : dir === "desc" ? <ChevronDown className="h-3 w-3" /> : null}
    </span>
  );
}

function Cell({
  t,
  col,
  onSave,
  numeric,
  rev,
}: {
  t: LibraryTrack;
  col: EditableCol;
  onSave: (id: number, col: EditableCol, v: string) => void;
  numeric?: boolean;
  rev: number;
}) {
  const raw = t[col];
  const initial = raw == null ? "" : String(raw);
  return (
    <input
      // key inclui o valor (re-hidrata ao voltar do virtualizador) e rev
      // (re-hidrata quando uma gravação falha e o texto digitado não salvou)
      key={`${t.id}:${col}:${initial}:${rev}`}
      defaultValue={initial}
      inputMode={numeric ? "decimal" : undefined}
      className="cell-input"
      onBlur={(e) => {
        if (e.target.value !== initial) onSave(t.id, col, e.target.value);
      }}
    />
  );
}
