import { useEffect, useMemo, useState } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  FileDown,
  GripVertical,
  ListMusic,
  Music4,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { listTracks, type LibraryTrack } from "@/modules/biblioteca/library/api";
import { gigDisplayName } from "../displayName";
import type { Gig } from "../types";
import { GigSetlist } from "./GigSetlist";
import {
  buildM3U8,
  computeSetTiming,
  fmtSetDuration,
  fmtTrackDuration,
  manualTrack,
  tracksWithoutAudio,
  trackFromLibrary,
  uid,
  type CurationBucket,
  type SetItem,
  type SetPlan,
  type SetTrack,
} from "../setPlan";

type Props = {
  plan: SetPlan;
  onChange: (plan: SetPlan) => void;
  gig: Gig | null;
};

const BUCKET_LABEL: Record<CurationBucket, string> = {
  inegociaveis: "Tracks inegociáveis",
  descobertas: "Descobertas da pesquisa",
  proprias: "Tracks próprias / autorais",
};
const BUCKET_HINT: Record<CurationBucket, string> = {
  inegociaveis: "As que NÃO podem faltar. Entram no Setlist automaticamente.",
  descobertas: "Achados da pesquisa musical — candidatas ao set.",
  proprias: "Suas produções pra tocar. Entram no Setlist automaticamente.",
};

export function SetPlanner({ plan, onChange, gig }: Props) {
  const [sub, setSub] = useState("curadoria");

  // Biblioteca de músicas carregada uma vez (busca client-side, como o
  // GigLibraryPicker). Reusada pelo adder e pelo export M3U8.
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  useEffect(() => {
    void listTracks().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  return (
    <Tabs value={sub} onValueChange={setSub} className="w-full">
      <TabsList className="flex w-full justify-start overflow-x-auto">
        <TabsTrigger value="curadoria">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Curadoria
        </TabsTrigger>
        <TabsTrigger value="setlist">
          <ListMusic className="mr-1.5 h-3.5 w-3.5" /> Setlist
        </TabsTrigger>
        <TabsTrigger value="executado">
          <Music4 className="mr-1.5 h-3.5 w-3.5" /> Executado
        </TabsTrigger>
      </TabsList>

      <TabsContent value="curadoria" className="space-y-4 pt-3 data-[state=inactive]:hidden" forceMount>
        <CuracaoTab plan={plan} onChange={onChange} library={library} />
      </TabsContent>

      <TabsContent value="setlist" className="space-y-4 pt-3 data-[state=inactive]:hidden" forceMount>
        <SetlistTab plan={plan} onChange={onChange} library={library} gig={gig} />
      </TabsContent>

      <TabsContent value="executado" className="space-y-4 pt-3 data-[state=inactive]:hidden" forceMount>
        {gig ? (
          <GigSetlist gigId={gig.id} />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Salve a GIG primeiro para registrar o que foi tocado (importar do Rekordbox/Serato/Traktor).
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}

// ── Aba 1: Curadoria Musical ─────────────────────────────────────────────────
function CuracaoTab({
  plan,
  onChange,
  library,
}: {
  plan: SetPlan;
  onChange: (p: SetPlan) => void;
  library: LibraryTrack[];
}) {
  const set = (patch: Partial<SetPlan>) => onChange({ ...plan, ...patch });

  return (
    <div className="space-y-5">
      <div className="grid gap-3">
        <div className="space-y-1">
          <Label>Conceito e intenção do set</Label>
          <Textarea
            value={plan.concept}
            onChange={(e) => set({ concept: e.target.value })}
            placeholder="Que sensação esse set entrega? Qual é a narrativa da noite?"
            rows={2}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Meu papel nesta gig</Label>
            <Textarea
              value={plan.role}
              onChange={(e) => set({ role: e.target.value })}
              placeholder="Abertura? Pico? Fechamento? DJ residente?"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label>Objetivo</Label>
            <Textarea
              value={plan.goal}
              onChange={(e) => set({ goal: e.target.value })}
              placeholder="O que quero provocar/alcançar com este set?"
              rows={2}
            />
          </div>
        </div>
      </div>

      {(["inegociaveis", "descobertas", "proprias"] as CurationBucket[]).map((bucket) => (
        <CurationBucketBlock
          key={bucket}
          bucket={bucket}
          tracks={plan[bucket]}
          onChange={(next) => set({ [bucket]: next } as Partial<SetPlan>)}
          library={library}
        />
      ))}
    </div>
  );
}

function CurationBucketBlock({
  bucket,
  tracks,
  onChange,
  library,
}: {
  bucket: CurationBucket;
  tracks: SetTrack[];
  onChange: (next: SetTrack[]) => void;
  library: LibraryTrack[];
}) {
  function add(t: SetTrack) {
    // evita duplicar a mesma faixa da biblioteca no mesmo balde
    if (t.library_track_id != null && tracks.some((x) => x.library_track_id === t.library_track_id)) {
      toast.error("Essa faixa já está na lista.");
      return;
    }
    onChange([...tracks, t]);
  }
  function remove(id: string) {
    onChange(tracks.filter((t) => t.id !== id));
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2">
        <div className="text-sm font-semibold">{BUCKET_LABEL[bucket]}</div>
        <div className="text-xs text-muted-foreground">{BUCKET_HINT[bucket]}</div>
      </div>

      {tracks.length > 0 && (
        <ul className="mb-2 space-y-1">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
              <Music4 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{t.title}</span>
                {t.artist && <span className="text-muted-foreground"> · {t.artist}</span>}
              </span>
              {!t.has_audio && (
                <Badge variant="outline" className="gap-1 text-[10px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> sem áudio
                </Badge>
              )}
              {t.duration_sec != null && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTrackDuration(t.duration_sec)}</span>
              )}
              <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(t.id)} aria-label="Remover">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TrackAdder library={library} exclude={tracks} onAdd={add} />
    </div>
  );
}

/** Busca na Biblioteca de Músicas (client-side) + adicionar manual (título/artista). */
function TrackAdder({
  library,
  exclude,
  onAdd,
}: {
  library: LibraryTrack[];
  exclude: SetTrack[];
  onAdd: (t: SetTrack) => void;
}) {
  const [q, setQ] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [mTitle, setMTitle] = useState("");
  const [mArtist, setMArtist] = useState("");

  const excludedIds = useMemo(
    () => new Set(exclude.map((t) => t.library_track_id).filter((x): x is number => x != null)),
    [exclude]
  );

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return library
      .filter((t) => !excludedIds.has(t.id))
      .filter((t) => `${t.artist ?? ""} ${t.title ?? ""}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [q, library, excludedIds]);

  function addManual() {
    if (!mTitle.trim()) {
      toast.error("Informe ao menos o título.");
      return;
    }
    onAdd(manualTrack(mTitle, mArtist));
    setMTitle("");
    setMArtist("");
    setManualOpen(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-7 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar na Biblioteca de Músicas…"
        />
      </div>
      {results.length > 0 && (
        <ul className="rounded-md border bg-popover">
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onAdd(trackFromLibrary(t));
                  setQ("");
                }}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{t.title ?? "Sem título"}</span>
                  {t.artist && <span className="text-muted-foreground"> · {t.artist}</span>}
                </span>
                {(!t.file_path || t.file_missing === 1) && (
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                )}
                {t.duration_sec != null && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTrackDuration(t.duration_sec)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {manualOpen ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input className="h-8 w-40 text-sm" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Título" autoFocus />
          <Input className="h-8 w-36 text-sm" value={mArtist} onChange={(e) => setMArtist(e.target.value)} placeholder="Artista" />
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={addManual}>Adicionar</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setManualOpen(false)}>Cancelar</Button>
        </div>
      ) : (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setManualOpen(true)}>
          + adicionar à mão (sem arquivo)
        </button>
      )}
    </div>
  );
}

// ── Aba 2: Setlist (DnD, blocos, transições, tempo, export) ───────────────────
function SetlistTab({
  plan,
  onChange,
  library,
  gig,
}: {
  plan: SetPlan;
  onChange: (p: SetPlan) => void;
  library: LibraryTrack[];
  gig: Gig | null;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const timing = computeSetTiming(plan);

  function setItems(setlist: SetItem[]) {
    onChange({ ...plan, setlist });
  }

  // Puxa Inegociáveis + Próprias da Curadoria que ainda não estão no setlist.
  function pullFromCuration() {
    const present = new Set(
      plan.setlist.map((i) => (i.library_track_id != null ? `l${i.library_track_id}` : `m${i.title}|${i.artist}`))
    );
    const additions: SetItem[] = [];
    const pull = (tracks: SetTrack[], origin: CurationBucket) => {
      for (const t of tracks) {
        const key = t.library_track_id != null ? `l${t.library_track_id}` : `m${t.title}|${t.artist}`;
        if (present.has(key)) continue;
        present.add(key);
        additions.push({ ...t, id: uid(), block: "", transition: "", origin });
      }
    };
    pull(plan.inegociaveis, "inegociaveis");
    pull(plan.proprias, "proprias");
    if (additions.length === 0) {
      toast.error("Nada novo pra puxar — Inegociáveis e Próprias já estão no setlist.");
      return;
    }
    setItems([...plan.setlist, ...additions]);
    toast.success(`${additions.length} faixa(s) adicionada(s) ao setlist.`);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = plan.setlist.findIndex((i) => i.id === active.id);
    const newIndex = plan.setlist.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setItems(arrayMove(plan.setlist, oldIndex, newIndex));
  }

  function updateItem(id: string, patch: Partial<SetItem>) {
    setItems(plan.setlist.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id: string) {
    setItems(plan.setlist.filter((i) => i.id !== id));
  }

  async function exportM3U8() {
    const missing = tracksWithoutAudio(plan);
    if (plan.setlist.length === 0) {
      toast.error("O setlist está vazio.");
      return;
    }
    if (missing.length > 0) {
      const names = missing.map((m) => m.title).slice(0, 6).join(", ");
      const extra = missing.length > 6 ? ` e mais ${missing.length - 6}` : "";
      const ok = await confirmDialog({
        title: "Faixas sem arquivo de áudio",
        description: `Atenção: as músicas ${names}${extra} podem não aparecer na sua playlist por não terem um arquivo de áudio vinculado. Exportar mesmo assim?`,
        confirmLabel: "Exportar",
      });
      if (!ok) return;
    }
    const byId = new Map(library.map((t) => [t.id, t]));
    const content = buildM3U8(plan, (lid) => {
      const t = byId.get(lid);
      if (!t || !t.file_path || t.file_missing === 1) return null;
      return { path: t.file_path, duration: t.duration_sec };
    });
    if (!content.includes("#EXTINF")) {
      toast.error("Nenhuma faixa com arquivo de áudio pra exportar.");
      return;
    }
    const base = `setlist-${gig ? gigDisplayName(gig) : "gig"}`.replace(/[^\w\-]+/g, "_");
    const saved = await saveTextFile(content, `${base}.m3u8`, "m3u8", "Playlist M3U8");
    if (saved) toast.success("Playlist exportada (Rekordbox/Serato importam .m3u8).");
  }

  async function exportPdf() {
    if (plan.setlist.length === 0) {
      toast.error("O setlist está vazio.");
      return;
    }
    try {
      await printSetPlanPdf(gig, plan);
    } catch (e) {
      toast.error(`Erro ao gerar PDF: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={pullFromCuration}>
          <Sparkles className="h-3.5 w-3.5" /> Puxar Inegociáveis + Próprias
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void exportPdf()}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void exportM3U8()}>
            <ListMusic className="h-3.5 w-3.5" /> Rekordbox/Serato
          </Button>
        </div>
      </div>

      {plan.setlist.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Setlist vazio. Use "Puxar Inegociáveis + Próprias" ou adicione faixas na Curadoria.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={plan.setlist.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1">
              {plan.setlist.map((item, idx) => {
                const prevBlock = idx > 0 ? plan.setlist[idx - 1].block : null;
                const showBlockHeader = item.block.trim() !== "" && item.block !== prevBlock;
                return (
                  <SetlistRow
                    key={item.id}
                    item={item}
                    index={idx}
                    isLast={idx === plan.setlist.length - 1}
                    showBlockHeader={showBlockHeader}
                    onUpdate={(patch) => updateItem(item.id, patch)}
                    onRemove={() => removeItem(item.id)}
                  />
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">Tempo médio de transição (min)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            className="h-8 w-28"
            value={plan.avg_transition_min}
            onChange={(e) => onChange({ ...plan, avg_transition_min: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Tempo total do set</Label>
          {/* Componente estático (read-only): resultado do cálculo automático. */}
          <div className="flex h-8 items-center rounded-md border bg-background px-3 text-lg font-bold tabular-nums">
            {fmtSetDuration(timing.totalSec)}
          </div>
          <p className="text-xs text-muted-foreground">
            {timing.withDuration} faixa(s) com duração
            {timing.missingDuration > 0 && ` · ${timing.missingDuration} sem duração`}
            {" · "}−{Math.round(timing.transitionSec / 60)} min de transições
          </p>
        </div>
      </div>
    </div>
  );
}

function SetlistRow({
  item,
  index,
  isLast,
  showBlockHeader,
  onUpdate,
  onRemove,
}: {
  item: SetItem;
  index: number;
  isLast: boolean;
  showBlockHeader: boolean;
  onUpdate: (patch: Partial<SetItem>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <li ref={setNodeRef} style={style}>
      {showBlockHeader && (
        <div className="mb-1 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <span className="h-px flex-1 bg-primary/30" /> {item.block} <span className="h-px flex-1 bg-primary/30" />
        </div>
      )}
      <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
        <button type="button" className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label="Arrastar">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{item.title}</span>
          {item.artist && <span className="text-muted-foreground"> · {item.artist}</span>}
        </span>
        {!item.has_audio && (
          <span title="Sem arquivo de áudio vinculado">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          </span>
        )}
        {item.duration_sec != null && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTrackDuration(item.duration_sec)}</span>
        )}
        <Input
          className="h-7 w-24 text-xs"
          value={item.block}
          onChange={(e) => onUpdate({ block: e.target.value })}
          placeholder="Bloco"
          title="Nome do bloco (agrupa as faixas seguintes)"
        />
        <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Remover">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Transição pra próxima faixa (opcional). */}
      {!isLast && (
        <div className="ml-9 flex items-center gap-1.5 py-0.5">
          <span className="text-[10px] uppercase text-muted-foreground">↳ transição</span>
          <Input
            className="h-6 flex-1 text-xs"
            value={item.transition}
            onChange={(e) => onUpdate({ transition: e.target.value })}
            placeholder="Como mixar pra próxima (opcional)"
          />
        </div>
      )}
    </li>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────
/** Salva um arquivo de texto via diálogo nativo (mesma lógica do savePdfDoc). */
async function saveTextFile(content: string, suggestedName: string, ext: string, filterName: string): Promise<boolean> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    const [{ save: saveDialog }, { writeTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await saveDialog({ title: "Salvar como…", defaultPath: suggestedName, filters: [{ name: filterName, extensions: [ext] }] });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }
  // Fallback web: download.
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** PDF do planejamento (conceito + setlist com blocos/transições + tempo). */
async function printSetPlanPdf(gig: Gig | null, plan: SetPlan): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { savePdfDoc } = await import("@/lib/savePdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 48;
  let y = 60;
  const timing = computeSetTiming(plan);

  const ensure = (need: number) => {
    if (y + need > H - 48) {
      doc.addPage();
      y = 60;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text(`Set Planner — ${gig ? gigDisplayName(gig) : "GIG"}`, mx, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`Tempo estimado do set: ${fmtSetDuration(timing.totalSec)} · ${plan.setlist.length} faixas`, mx, y);
  y += 20;
  doc.setDrawColor(210);
  doc.line(mx, y, W - mx, y);
  y += 18;

  const paras: [string, string][] = [
    ["Conceito e intenção", plan.concept],
    ["Papel na gig", plan.role],
    ["Objetivo", plan.goal],
  ];
  for (const [label, val] of paras) {
    if (!val.trim()) continue;
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(label, mx, y);
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70);
    const lines = doc.splitTextToSize(val, W - 2 * mx) as string[];
    for (const ln of lines) {
      ensure(14);
      doc.text(ln, mx, y);
      y += 14;
    }
    y += 6;
  }

  ensure(24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text("Setlist", mx, y);
  y += 18;

  let lastBlock: string | null = null;
  plan.setlist.forEach((it, i) => {
    if (it.block.trim() && it.block !== lastBlock) {
      ensure(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(it.block.toUpperCase(), mx, y);
      y += 14;
      lastBlock = it.block;
    }
    ensure(16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(30);
    const label = `${i + 1}. ${it.title}${it.artist ? ` — ${it.artist}` : ""}`;
    doc.text(label, mx, y);
    if (it.duration_sec != null) {
      doc.setTextColor(150);
      doc.text(fmtTrackDuration(it.duration_sec), W - mx, y, { align: "right" });
    }
    y += 15;
    if (it.transition.trim()) {
      ensure(13);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140);
      const t = doc.splitTextToSize(`↳ ${it.transition}`, W - 2 * mx - 16) as string[];
      for (const ln of t) {
        ensure(12);
        doc.text(ln, mx + 16, y);
        y += 12;
      }
    }
  });

  const saved = await savePdfDoc(doc, `set-planner-${gig ? gigDisplayName(gig) : "gig"}`);
  if (saved) toast.success("PDF do Set Planner exportado.");
}
