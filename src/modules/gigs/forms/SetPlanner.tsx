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
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  FileDown,
  GripVertical,
  ListMusic,
  Lock,
  Music4,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { listTracks, type LibraryTrack } from "@/modules/biblioteca/library/api";
import { gigDisplayName } from "../displayName";
import type { Gig } from "../types";
import { GigSetlist } from "./GigSetlist";
import {
  MOMENT_SUGGESTIONS,
  TAG_LABEL,
  buildM3U8,
  computeSetTiming,
  fmtSetDuration,
  fmtTrackDuration,
  manualTrack,
  momentSubtotalSec,
  newMoment,
  regroup,
  setItemFrom,
  trackFromLibrary,
  trackKey,
  tracksByTag,
  tracksWithoutAudio,
  type SetItem,
  type SetMoment,
  type SetPlan,
  type SetTrack,
  type TrackTag,
} from "../setPlan";

type Props = {
  plan: SetPlan;
  onChange: (plan: SetPlan) => void;
  gig: Gig | null;
};

const TAG_ICON: Record<TrackTag, typeof Lock> = {
  inegociavel: Lock,
  autoral: Star,
  achado: Sparkles,
};
const TAG_COLOR: Record<TrackTag, string> = {
  inegociavel: "text-rose-500",
  autoral: "text-violet-500",
  achado: "text-amber-500",
};
const TAG_ORDER: TrackTag[] = ["achado", "inegociavel", "autoral"];

export function SetPlanner({ plan, onChange, gig }: Props) {
  const [sub, setSub] = useState("setlist");

  // Biblioteca de músicas carregada uma vez (busca client-side, reusada pelo
  // adder e pelo export M3U8).
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  useEffect(() => {
    void listTracks().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  return (
    <Tabs value={sub} onValueChange={setSub} className="w-full">
      <TabsList className="flex w-full justify-start overflow-x-auto">
        <TabsTrigger value="setlist">
          <ListMusic className="mr-1.5 h-3.5 w-3.5" /> Setlist
        </TabsTrigger>
        <TabsTrigger value="curadoria">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Curadoria
        </TabsTrigger>
        <TabsTrigger value="executado">
          <Music4 className="mr-1.5 h-3.5 w-3.5" /> Executado
        </TabsTrigger>
      </TabsList>

      <TabsContent value="setlist" className="space-y-4 pt-3 data-[state=inactive]:hidden" forceMount>
        <SetlistTab plan={plan} onChange={onChange} library={library} gig={gig} />
      </TabsContent>

      <TabsContent value="curadoria" className="space-y-4 pt-3 data-[state=inactive]:hidden" forceMount>
        <CuracaoTab plan={plan} onChange={onChange} library={library} />
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

// ── Curadoria: conceito/papel/objetivo + listas Inegociáveis e Autorais ──────
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

  // Adiciona uma faixa taggeada direto no setlist (sem momento). É a mesma fonte
  // do Setlist, então aparece nos dois lugares.
  function addTagged(track: SetTrack, tag: TrackTag) {
    if (plan.setlist.some((i) => trackKey(i) === trackKey(track))) {
      toast.error("Essa faixa já está no set.");
      return;
    }
    onChange({ ...plan, setlist: regroup([...plan.setlist, setItemFrom(track, tag, null)], plan.moments) });
  }
  function removeItem(id: string) {
    onChange({ ...plan, setlist: plan.setlist.filter((i) => i.id !== id) });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            Conceito
            <InfoHint>Que sensação esse set entrega? Qual é a narrativa da noite?</InfoHint>
          </Label>
          <Textarea value={plan.concept} onChange={(e) => set({ concept: e.target.value })} placeholder="A narrativa da noite" rows={2} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              Papel
              <InfoHint>Seu papel nesta gig: abertura, pico, fechamento, residente…</InfoHint>
            </Label>
            <Textarea value={plan.role} onChange={(e) => set({ role: e.target.value })} placeholder="Abertura, pico, fechamento…" rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              Objetivo
              <InfoHint>O que você quer provocar ou alcançar com este set?</InfoHint>
            </Label>
            <Textarea value={plan.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="O que quer provocar" rows={2} />
          </div>
        </div>
      </div>

      <CurationList
        tag="inegociavel"
        hint="As que não podem faltar. Já entram no setlist."
        tracks={tracksByTag(plan, "inegociavel")}
        library={library}
        exclude={plan.setlist}
        onAdd={(t) => addTagged(t, "inegociavel")}
        onRemove={removeItem}
      />
      <CurationList
        tag="autoral"
        hint="Suas produções pra tocar. Já entram no setlist."
        tracks={tracksByTag(plan, "autoral")}
        library={library}
        exclude={plan.setlist}
        onAdd={(t) => addTagged(t, "autoral")}
        onRemove={removeItem}
      />
    </div>
  );
}

function CurationList({
  tag,
  hint,
  tracks,
  library,
  exclude,
  onAdd,
  onRemove,
}: {
  tag: TrackTag;
  hint: string;
  tracks: SetItem[];
  library: LibraryTrack[];
  exclude: SetItem[];
  onAdd: (t: SetTrack) => void;
  onRemove: (id: string) => void;
}) {
  const Icon = TAG_ICON[tag];
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Icon className={"h-3.5 w-3.5 " + TAG_COLOR[tag]} /> {TAG_LABEL[tag] + "s"}
        <InfoHint>{hint}</InfoHint>
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
              {t.duration_sec != null && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtTrackDuration(t.duration_sec)}</span>
              )}
              <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onRemove(t.id)} aria-label="Remover">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TrackAdder library={library} exclude={exclude} onAdd={onAdd} />
    </div>
  );
}

/** Busca na Biblioteca (client-side) + adicionar manual. `onAdd` recebe a faixa
 *  (o chamador decide a tag). */
function TrackAdder({
  library,
  exclude,
  onAdd,
  autoFocusManual,
}: {
  library: LibraryTrack[];
  exclude: SetItem[];
  onAdd: (t: SetTrack) => void;
  autoFocusManual?: boolean;
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
        <Input className="h-8 pl-7 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na Biblioteca de Músicas" />
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
                {(!t.file_path || t.file_missing === 1) && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />}
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
          <Input className="h-8 w-40 text-sm" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Título" autoFocus={autoFocusManual ?? true} />
          <Input className="h-8 w-36 text-sm" value={mArtist} onChange={(e) => setMArtist(e.target.value)} placeholder="Artista" />
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={addManual}>Adicionar</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setManualOpen(false)}>Cancelar</Button>
        </div>
      ) : (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setManualOpen(true)}>
          + adicionar à mão
        </button>
      )}
    </div>
  );
}

// ── Setlist: momentos + adição direta + tempo ────────────────────────────────
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
  function setMoments(moments: SetMoment[]) {
    onChange({ ...plan, moments, setlist: regroup(plan.setlist, moments) });
  }

  // Faixa adicionada direto no setlist (com tag + momento escolhidos no adder).
  function addToSetlist(track: SetTrack, tag: TrackTag, momentId: string | null) {
    if (plan.setlist.some((i) => trackKey(i) === trackKey(track))) {
      toast.error("Essa faixa já está no set.");
      return;
    }
    setItems(regroup([...plan.setlist, setItemFrom(track, tag, momentId)], plan.moments));
  }

  function addMoment(name: string) {
    const m = newMoment(name, plan.moments.length);
    setMoments([...plan.moments, m]);
  }
  function renameMoment(id: string, name: string) {
    onChange({ ...plan, moments: plan.moments.map((m) => (m.id === id ? { ...m, name } : m)) });
  }
  function recolorMoment(id: string, color: string) {
    onChange({ ...plan, moments: plan.moments.map((m) => (m.id === id ? { ...m, color } : m)) });
  }
  async function deleteMoment(id: string) {
    const m = plan.moments.find((x) => x.id === id);
    const has = plan.setlist.some((i) => i.moment_id === id);
    if (has) {
      const ok = await confirmDialog({
        title: `Excluir "${m?.name}"?`,
        description: "As faixas dele voltam para Sem momento.",
        confirmLabel: "Excluir",
        destructive: true,
      });
      if (!ok) return;
    }
    const moments = plan.moments.filter((x) => x.id !== id);
    const setlist = plan.setlist.map((i) => (i.moment_id === id ? { ...i, moment_id: null } : i));
    onChange({ ...plan, moments, setlist: regroup(setlist, moments) });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = plan.setlist.findIndex((i) => i.id === active.id);
    const newIndex = plan.setlist.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(plan.setlist, oldIndex, newIndex);
    // Ao soltar, a faixa herda o momento do vizinho de cima (ou de baixo) —
    // arrastar entre grupos reatribui o momento sem picker.
    const pos = moved.findIndex((i) => i.id === active.id);
    const neighbor = pos > 0 ? moved[pos - 1].moment_id : pos < moved.length - 1 ? moved[pos + 1].moment_id : null;
    const withMoment = moved.map((i) => (i.id === active.id ? { ...i, moment_id: neighbor } : i));
    setItems(regroup(withMoment, plan.moments));
  }

  function updateItem(id: string, patch: Partial<SetItem>) {
    const next = plan.setlist.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setItems("moment_id" in patch ? regroup(next, plan.moments) : next);
  }
  function removeItem(id: string) {
    setItems(plan.setlist.filter((i) => i.id !== id));
  }

  // Grupos na ordem: momentos + "Sem momento" no fim (se tiver faixa sem momento).
  const groups: { moment: SetMoment | null; items: SetItem[] }[] = useMemo(() => {
    const g: { moment: SetMoment | null; items: SetItem[] }[] = plan.moments.map((m) => ({
      moment: m,
      items: plan.setlist.filter((i) => i.moment_id === m.id),
    }));
    const orphans = plan.setlist.filter((i) => i.moment_id == null);
    if (orphans.length > 0 || plan.moments.length === 0) g.push({ moment: null, items: orphans });
    return g;
  }, [plan.moments, plan.setlist]);

  async function exportM3U8() {
    if (plan.setlist.length === 0) {
      toast.error("O setlist está vazio.");
      return;
    }
    const missing = tracksWithoutAudio(plan);
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
      <MomentsBar
        moments={plan.moments}
        counts={Object.fromEntries(plan.moments.map((m) => [m.id, plan.setlist.filter((i) => i.moment_id === m.id).length]))}
        onReorder={setMoments}
        onAdd={addMoment}
        onRename={renameMoment}
        onRecolor={recolorMoment}
        onDelete={deleteMoment}
      />

      <SetlistAdder library={library} exclude={plan.setlist} moments={plan.moments} onAdd={addToSetlist} />

      {plan.setlist.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Adicione faixas acima. Marque a tag e o momento de cada uma.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={plan.setlist.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {groups.map(({ moment, items }) => (
                <div key={moment?.id ?? "none"}>
                  {(moment != null || plan.moments.length > 0) && (
                    <MomentHeader moment={moment} count={items.length} subtotalSec={momentSubtotalSec(plan, moment?.id ?? null)} />
                  )}
                  {items.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Vazio. Use o seletor de momento nas faixas ou adicione acima.</p>
                  ) : (
                    <ol className="space-y-1">
                      {items.map((item) => (
                        <SetlistRow
                          key={item.id}
                          item={item}
                          index={plan.setlist.findIndex((i) => i.id === item.id)}
                          isLast={plan.setlist[plan.setlist.length - 1]?.id === item.id}
                          moments={plan.moments}
                          onUpdate={(patch) => updateItem(item.id, patch)}
                          onRemove={() => removeItem(item.id)}
                        />
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Rodapé compacto: transição média discreta (esq.) + tempo total pequeno (dir.) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Transição</span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-accent"
            onClick={() => onChange({ ...plan, avg_transition_min: Math.max(0, Math.round((plan.avg_transition_min - 0.5) * 2) / 2) })}
            aria-label="Menos transição"
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-medium tabular-nums">{plan.avg_transition_min} min</span>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-accent"
            onClick={() => onChange({ ...plan, avg_transition_min: Math.round((plan.avg_transition_min + 0.5) * 2) / 2 })}
            aria-label="Mais transição"
          >
            +
          </button>
          <InfoHint>Tempo médio que cada mixagem sobrepõe. O total do set desconta isso ({timing.transitions} transições).</InfoHint>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{fmtSetDuration(timing.totalSec)}</span>
          <InfoHint>
            Soma das durações menos as transições.
            {timing.missingDuration > 0 && ` ${timing.missingDuration} faixa(s) sem duração ficam de fora da conta.`}
          </InfoHint>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void exportPdf()}>
          <FileDown className="h-3.5 w-3.5" /> PDF
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void exportM3U8()}>
          <ListMusic className="h-3.5 w-3.5" /> Rekordbox/Serato
        </Button>
      </div>
    </div>
  );
}

// ── Barra de momentos (chips reordenáveis + adicionar) ───────────────────────
const MOMENT_PALETTE = ["#8b5cf6", "#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#f43f5e", "#06b6d4", "#f97316"];

function MomentsBar({
  moments,
  counts,
  onReorder,
  onAdd,
  onRename,
  onRecolor,
  onDelete,
}: {
  moments: SetMoment[];
  counts: Record<string, number>;
  onReorder: (m: SetMoment[]) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const o = moments.findIndex((m) => m.id === active.id);
    const n = moments.findIndex((m) => m.id === over.id);
    if (o < 0 || n < 0) return;
    onReorder(arrayMove(moments, o, n));
  }
  function commitAdd(v: string) {
    if (!v.trim()) return;
    onAdd(v.trim());
    setName("");
  }

  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        Momentos
        <InfoHint>Blocos do set pensados pela pista: Warm-up, Pico, Grand Finale, ou um bloco de gênero. Arraste pra reordenar.</InfoHint>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={moments.map((m) => m.id)} strategy={horizontalListSortingStrategy}>
            {moments.map((m) => (
              <MomentChip
                key={m.id}
                moment={m}
                count={counts[m.id] ?? 0}
                onRename={(v) => onRename(m.id, v)}
                onRecolor={() => {
                  const idx = MOMENT_PALETTE.indexOf(m.color ?? "");
                  onRecolor(m.id, MOMENT_PALETTE[(idx + 1) % MOMENT_PALETTE.length]);
                }}
                onDelete={() => void onDelete(m.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {adding ? (
          <div className="flex items-center gap-1">
            <Input
              className="h-7 w-32 text-xs"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitAdd(name); }
                if (e.key === "Escape") setAdding(false);
              }}
              onBlur={() => { commitAdd(name); setAdding(false); }}
              placeholder="Nome do momento"
            />
          </div>
        ) : (
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" /> Momento
          </button>
        )}
      </div>

      {moments.length === 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {MOMENT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
              onClick={() => onAdd(s)}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MomentChip({
  moment,
  count,
  onRename,
  onRecolor,
  onDelete,
}: {
  moment: SetMoment;
  count: number;
  onRename: (v: string) => void;
  onRecolor: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: moment.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(moment.name);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-xs">
      <button type="button" className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label="Arrastar momento">
        <GripVertical className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ background: moment.color ?? "#8b5cf6" }}
        onClick={onRecolor}
        aria-label="Trocar cor"
      />
      {editing ? (
        <input
          className="w-24 bg-transparent text-xs outline-none"
          value={v}
          autoFocus
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { onRename(v.trim() || moment.name); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onRename(v.trim() || moment.name); setEditing(false); }
            if (e.key === "Escape") { setV(moment.name); setEditing(false); }
          }}
        />
      ) : (
        <button type="button" className="font-medium" onClick={() => { setV(moment.name); setEditing(true); }}>
          {moment.name}
        </button>
      )}
      <span className="tabular-nums text-muted-foreground">{count}</span>
      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label="Excluir momento">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MomentHeader({ moment, count, subtotalSec }: { moment: SetMoment | null; count: number; subtotalSec: number }) {
  const color = moment?.color ?? "#94a3b8";
  return (
    <div className="mb-1 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {moment ? moment.name : "Sem momento"}
      <span className="text-muted-foreground">· {count}</span>
      {subtotalSec > 0 && <span className="ml-auto font-normal normal-case tabular-nums text-muted-foreground">{fmtSetDuration(subtotalSec)}</span>}
    </div>
  );
}

// ── Adder do setlist: busca/manual + tag + momento ───────────────────────────
function SetlistAdder({
  library,
  exclude,
  moments,
  onAdd,
}: {
  library: LibraryTrack[];
  exclude: SetItem[];
  moments: SetMoment[];
  onAdd: (t: SetTrack, tag: TrackTag, momentId: string | null) => void;
}) {
  const [tag, setTag] = useState<TrackTag>("achado");
  const [momentId, setMomentId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border text-xs">
          {TAG_ORDER.map((t) => {
            const Icon = TAG_ICON[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={
                  "flex items-center gap-1 px-2 py-1 transition " +
                  (tag === t ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent")
                }
              >
                <Icon className="h-3 w-3" /> {TAG_LABEL[t]}
              </button>
            );
          })}
        </div>
        {moments.length > 0 && (
          <select
            className="h-7 rounded-md border bg-background px-2 text-xs"
            value={momentId ?? ""}
            onChange={(e) => setMomentId(e.target.value || null)}
          >
            <option value="">Sem momento</option>
            {moments.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <InfoHint>A tag marca o papel da faixa (achado, inegociável, autoral). O momento agrupa na pista.</InfoHint>
      </div>
      <TrackAdder library={library} exclude={exclude} onAdd={(t) => onAdd(t, tag, momentId)} />
    </div>
  );
}

function SetlistRow({
  item,
  index,
  isLast,
  moments,
  onUpdate,
  onRemove,
}: {
  item: SetItem;
  index: number;
  isLast: boolean;
  moments: SetMoment[];
  onUpdate: (patch: Partial<SetItem>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const Icon = TAG_ICON[item.tag];

  return (
    <li ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
        <button type="button" className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label="Arrastar">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <span title={TAG_LABEL[item.tag]} className="shrink-0">
          <Icon className={"h-3.5 w-3.5 " + TAG_COLOR[item.tag]} />
        </span>
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
        <select
          className="h-7 max-w-[8rem] shrink-0 rounded border bg-background px-1 text-xs text-muted-foreground"
          value={item.moment_id ?? ""}
          onChange={(e) => onUpdate({ moment_id: e.target.value || null })}
          title="Momento"
        >
          <option value="">Sem momento</option>
          {moments.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Remover">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!isLast && (
        <div className="ml-9 flex items-center gap-1.5 py-0.5">
          <span className="text-[10px] uppercase text-muted-foreground">↳</span>
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
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** PDF do planejamento agrupado por Momentos. */
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
  doc.text(`Tempo estimado: ${fmtSetDuration(timing.totalSec)} · ${plan.setlist.length} faixas`, mx, y);
  y += 20;
  doc.setDrawColor(210);
  doc.line(mx, y, W - mx, y);
  y += 18;

  const paras: [string, string][] = [
    ["Conceito", plan.concept],
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

  // Grupos: momentos na ordem + Sem momento no fim.
  const groups: { name: string; items: SetItem[] }[] = plan.moments.map((m) => ({
    name: m.name,
    items: plan.setlist.filter((i) => i.moment_id === m.id),
  }));
  const orphans = plan.setlist.filter((i) => i.moment_id == null);
  if (orphans.length > 0) groups.push({ name: "Sem momento", items: orphans });

  let n = 0;
  for (const g of groups) {
    if (g.items.length === 0) continue;
    ensure(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(g.name.toUpperCase(), mx, y);
    const sub = g.items.reduce((a, i) => a + (i.duration_sec ?? 0), 0);
    if (sub > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(fmtSetDuration(sub), W - mx, y, { align: "right" });
    }
    y += 16;
    for (const it of g.items) {
      n += 1;
      ensure(16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30);
      const label = `${n}. ${it.title}${it.artist ? ` — ${it.artist}` : ""}`;
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
    }
    y += 8;
  }

  const saved = await savePdfDoc(doc, `set-planner-${gig ? gigDisplayName(gig) : "gig"}`);
  if (saved) toast.success("PDF do Set Planner exportado.");
}
