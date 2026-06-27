import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import {
  addGigLibraryTrack,
  listGigLibraryTracks,
  listTracks,
  removeGigLibraryTrack,
  type GigLibraryTrack,
  type LibraryTrack,
} from "../library/api";

/**
 * Seletor de faixas da Biblioteca de Músicas pro setlist de um GIG. Ao adicionar,
 * grava um snapshot (título/artista) — se a faixa for excluída da biblioteca
 * depois, o GIG mantém o que foi tocado.
 */
export function GigLibraryPicker({ gigId }: { gigId: number }) {
  const [all, setAll] = useState<LibraryTrack[]>([]);
  const [added, setAdded] = useState<GigLibraryTrack[]>([]);
  const [q, setQ] = useState("");

  const reload = useCallback(() => {
    void listGigLibraryTracks(gigId).then(setAdded);
  }, [gigId]);

  useEffect(() => {
    void listTracks().then(setAll);
    reload();
  }, [gigId, reload]);

  const addedIds = useMemo(() => new Set(added.map((a) => a.library_track_id)), [added]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return all
      .filter((x) => !addedIds.has(x.id) && [x.title, x.artist].some((v) => (v ?? "").toLowerCase().includes(t)))
      .slice(0, 12);
  }, [q, all, addedIds]);

  async function add(track: LibraryTrack) {
    try {
      await addGigLibraryTrack(gigId, track);
      setQ("");
      reload();
    } catch (e) {
      toast.error(`Não consegui adicionar a faixa: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-2">
      {added.length > 0 && (
        <ul className="space-y-1">
          {added.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
              <span className="flex-1 truncate">
                {a.played_title || "(sem título)"}
                {a.played_artist ? ` — ${a.played_artist}` : ""}
                {a.library_track_id == null && (
                  <span className="ml-1 text-[10px] text-muted-foreground">(arquivada)</span>
                )}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removeGigLibraryTrack(a.id);
                    reload();
                  } catch (e) {
                    toast.error(`Não consegui remover a faixa: ${String(e)}`);
                  }
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        className="h-8 w-full rounded-md border bg-background px-2 text-sm"
        placeholder="Buscar na biblioteca…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() && (
        results.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Nada encontrado na biblioteca.</p>
        ) : (
          <ul className="overflow-hidden rounded-md border">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void add(r)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent",
                    i > 0 && "border-t"
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {r.title || "(sem título)"}
                    {r.artist ? ` — ${r.artist}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
