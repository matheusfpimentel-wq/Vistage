import { useEffect, useRef, useState } from "react";
import { EMPTY_VALUE } from "@/lib/format";
import { Check, ChevronDown, ChevronRight, FileMusic, Library, Loader2, Music, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  deleteSetlist,
  detectAndParse,
  getSetlistsForGig,
  saveSetlist,
  updateSetlistTracks,
  type GigSetlist,
  type ParsedSetlist,
  type SetlistTrack,
} from "../setlist";
import { createTrack } from "@/modules/music/api";
import { TRACK_KINDS, TRACK_KIND_LABEL, type TrackKind } from "@/modules/music/stages";
import { cn } from "@/lib/utils";

type Props = { gigId: number };

const FORMAT_LABEL: Record<string, string> = {
  rekordbox_xml: "Rekordbox",
  rekordbox_txt: "Rekordbox",
  traktor_nml: "Traktor",
  serato_session: "Serato",
  m3u: "M3U",
};

const FORMAT_CLASS: Record<string, string> = {
  rekordbox_xml: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  rekordbox_txt: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  traktor_nml: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  serato_session: "bg-green-500/15 text-green-400 border-green-500/30",
  m3u: "",
};

/** Decodifica um buffer de texto detectando BOM UTF-16 (Rekordbox TXT) ou UTF-8. */
function decodeTextBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function formatDuration(sec: number | null): string {
  if (!sec) return EMPTY_VALUE;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function GigSetlist({ gigId }: Props) {
  const [setlists, setSetlists] = useState<GigSetlist[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<ParsedSetlist | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Faixa em processo de adição à biblioteca de produção.
  const [addTarget, setAddTarget] = useState<{ setlistId: number; position: number; track: SetlistTrack } | null>(null);
  const [addKind, setAddKind] = useState<TrackKind>("edit");
  const [addingToLib, setAddingToLib] = useState(false);

  async function load() {
    setSetlists(await getSetlistsForGig(gigId));
  }

  useEffect(() => { void load(); }, [gigId]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isBinary = name.endsWith(".session");
    // TXT/CSV do Rekordbox costumam vir em UTF-16 — lemos os bytes e decodificamos
    // pelo BOM, senão o conteúdo chega embaralhado.
    const needsDecode = name.endsWith(".txt") || name.endsWith(".csv");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = needsDecode
        ? decodeTextBuffer(ev.target?.result as ArrayBuffer)
        : (ev.target?.result as string);
      try {
        const parsed = detectAndParse(file.name, content);
        if (parsed.tracks.length === 0) {
          toast.error("Nenhuma track encontrada no arquivo.");
          return;
        }
        setPreview(parsed);
      } catch (err) {
        toast.error(`Erro ao ler arquivo: ${String(err)}`);
      }
    };
    if (isBinary) reader.readAsBinaryString(file);
    else if (needsDecode) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    // reset so same file can be re-imported
    e.target.value = "";
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setSaving(true);
    try {
      await saveSetlist(gigId, preview);
      toast.success(`${preview.tracks.length} tracks importadas`);
      setPreview(null);
      await load();
    } catch (err) {
      toast.error(`Erro ao salvar: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSetlist(id);
      toast.success("Setlist removido");
      await load();
    } catch (err) {
      toast.error(`Erro: ${String(err)}`);
    }
  }

  function openAddToLibrary(setlistId: number, track: SetlistTrack) {
    setAddKind("edit");
    setAddTarget({ setlistId, position: track.position, track });
  }

  async function handleAddToLibrary() {
    if (!addTarget) return;
    const { setlistId, position, track } = addTarget;
    setAddingToLib(true);
    try {
      const trackId = await createTrack({
        project_id: null, // auto-cria projeto
        kind: addKind,
        title_working: track.title || "Sem título",
        title_final: null,
        bpm: track.bpm,
        key: track.key,
        duration_seconds: track.duration_sec,
        mood_tags: [],
        genre_primary: track.genre,
        genre_secondary: null,
        references: [],
        constraints: null,
        concept_narrative: track.artist ? `Tocada na GIG — original de ${track.artist}.` : null,
        daw_project_path: null,
        stems_path: null,
        final_files_path: null,
        stage_notes: null,
        creative_block_notes: null,
      });
      // Marca a faixa do setlist como vinculada à biblioteca.
      const sl = setlists.find((s) => s.id === setlistId);
      if (sl) {
        const nextTracks = sl.tracks.map((t) =>
          t.position === position ? { ...t, library_track_id: trackId } : t
        );
        await updateSetlistTracks(setlistId, nextTracks);
      }
      toast.success("Adicionada à biblioteca de produção");
      setAddTarget(null);
      await load();
    } catch (err) {
      toast.error(`Erro ao adicionar: ${String(err)}`);
    } finally {
      setAddingToLib(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {setlists.length === 0
            ? "Nenhum setlist importado ainda."
            : `${setlists.length} setlist${setlists.length > 1 ? "s" : ""} importado${setlists.length > 1 ? "s" : ""}.`}
        </p>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Plus className="h-3.5 w-3.5" /> Importar setlist
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.nml,.m3u,.m3u8,.session,.txt,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {setlists.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Music className="h-8 w-8 opacity-40" />
          <span>
            Importe o histórico do Rekordbox (.txt / .xml), Traktor (.nml),
            Serato (.session) ou M3U — exportado direto no pen-drive.
          </span>
        </div>
      )}

      {setlists.map((sl) => (
        <div key={sl.id} className="rounded-md border overflow-hidden">
          <div
            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
            onClick={() => toggleExpand(sl.id)}
          >
            {expanded.has(sl.id)
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <FileMusic className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Badge
              variant="outline"
              className={cn("text-xs", FORMAT_CLASS[sl.source_format])}
            >
              {FORMAT_LABEL[sl.source_format] ?? sl.source_format}
            </Badge>
            <span className="flex-1 truncate text-sm font-medium">
              {sl.source_filename ?? EMPTY_VALUE}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {sl.tracks.length} tracks ·{" "}
              {new Date(sl.imported_at).toLocaleDateString("pt-BR")}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={(e) => { e.stopPropagation(); void handleDelete(sl.id); }}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>

          {expanded.has(sl.id) && (
            <>
              {(() => {
                const added = sl.tracks.filter((t) => t.library_track_id);
                if (added.length === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/20 px-3 py-2 text-xs">
                    <Library className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Na biblioteca:</span>
                    {added.map((t) => (
                      <Badge key={t.position} variant="outline" className="gap-1 text-[11px]">
                        <Check className="h-3 w-3 text-emerald-500" />
                        {t.title || EMPTY_VALUE}
                      </Badge>
                    ))}
                  </div>
                );
              })()}
              <div className="border-t overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-right w-8">#</th>
                      <th className="px-3 py-1.5 text-left">Título</th>
                      <th className="px-3 py-1.5 text-left">Artista</th>
                      <th className="px-3 py-1.5 text-right">BPM</th>
                      <th className="px-3 py-1.5 text-center">Key</th>
                      <th className="px-3 py-1.5 text-right">Duração</th>
                      <th className="px-3 py-1.5 text-right">Biblioteca</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sl.tracks.map((t) => (
                      <tr key={t.position} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground text-xs">{t.position}</td>
                        <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">{t.title || EMPTY_VALUE}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[160px]">{t.artist || EMPTY_VALUE}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{t.bpm ? Math.round(t.bpm) : EMPTY_VALUE}</td>
                        <td className="px-3 py-1.5 text-center text-xs">{t.key ?? EMPTY_VALUE}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs">{formatDuration(t.duration_sec)}</td>
                        <td className="px-3 py-1.5 text-right">
                          {t.library_track_id ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                              <Check className="h-3.5 w-3.5" /> Adicionada
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs"
                              onClick={() => openAddToLibrary(sl.id, t)}
                            >
                              <Plus className="h-3.5 w-3.5" /> Biblioteca
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Preview / confirm dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar importação</DialogTitle>
            <DialogDescription>
              <Badge
                variant="outline"
                className={cn("mr-2 text-xs", preview ? FORMAT_CLASS[preview.source_format] : "")}
              >
                {preview ? (FORMAT_LABEL[preview.source_format] ?? preview.source_format) : ""}
              </Badge>
              {preview?.source_filename} · <strong>{preview?.tracks.length} tracks</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-60 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-right w-8">#</th>
                  <th className="px-3 py-1.5 text-left">Título</th>
                  <th className="px-3 py-1.5 text-left">Artista</th>
                  <th className="px-3 py-1.5 text-right">BPM</th>
                </tr>
              </thead>
              <tbody>
                {preview?.tracks.map((t) => (
                  <tr key={t.position} className="border-t">
                    <td className="px-3 py-1 text-right text-xs text-muted-foreground tabular-nums">{t.position}</td>
                    <td className="px-3 py-1 truncate max-w-[180px]">{t.title || EMPTY_VALUE}</td>
                    <td className="px-3 py-1 text-muted-foreground truncate max-w-[140px] text-xs">{t.artist || EMPTY_VALUE}</td>
                    <td className="px-3 py-1 text-right text-xs tabular-nums">{t.bpm ? Math.round(t.bpm) : EMPTY_VALUE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button onClick={handleConfirmImport} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adicionar faixa do setlist à biblioteca de produção */}
      <Dialog open={!!addTarget} onOpenChange={(o) => { if (!o) setAddTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar à biblioteca</DialogTitle>
            <DialogDescription>
              <strong>{addTarget?.track.title || EMPTY_VALUE}</strong>
              {addTarget?.track.artist ? ` · ${addTarget.track.artist}` : ""}
              {addTarget?.track.bpm ? ` · ${Math.round(addTarget.track.bpm)} BPM` : ""}
              {addTarget?.track.key ? ` · ${addTarget.track.key}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo de produção</label>
            <Select value={addKind} onValueChange={(v) => setAddKind(v as TrackKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{TRACK_KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cria uma track no módulo de Produção Musical no estágio Ideação, já
              com BPM, key e gênero preenchidos.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTarget(null)}>Cancelar</Button>
            <Button onClick={handleAddToLibrary} disabled={addingToLib}>
              {addingToLib && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
