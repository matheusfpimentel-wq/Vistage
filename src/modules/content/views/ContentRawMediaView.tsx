import { useCallback, useEffect, useState } from "react";
import { Film, Image as ImageIcon, Sparkles, Trash2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { useImageUrl } from "@/lib/uploads";
import { formatDate } from "@/lib/format";
import {
  listRawMedia,
  deleteRawMedia,
  setRawMediaStatus,
  rawMediaToContent,
} from "../api";
import type {
  ContentRawMediaStatus,
  ContentRawMediaWithGig,
} from "../types";

type StatusFilter = ContentRawMediaStatus | "todos";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "novo", label: "Novos" },
  { key: "usado", label: "Usados" },
  { key: "arquivado", label: "Arquivados" },
  { key: "todos", label: "Todos" },
];

function Thumb({ item }: { item: ContentRawMediaWithGig }) {
  const url = useImageUrl(item.file_path);
  const isClip = item.media_kind === "clip";
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
      {url ? (
        isClip ? (
          <video
            src={url}
            muted
            playsInline
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <img src={url} alt="" className="h-full w-full object-cover" />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {isClip ? <Film className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
        </div>
      )}
      <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {isClip ? "Clipe" : "Foto"}
      </span>
    </div>
  );
}

/**
 * §5 — Inbox de matéria-prima: fotos/clipes capturados no celular durante a GIG
 * chegam aqui como semente de conteúdo (aftermovie, stories). Cada peça pode
 * virar um Conteúdo de verdade, ser arquivada ou excluída.
 */
export function ContentRawMediaView({
  onPromoted,
  onChanged,
}: {
  onPromoted?: (contentId: number) => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<ContentRawMediaWithGig[]>([]);
  const [status, setStatus] = useState<StatusFilter>("novo");

  const refresh = useCallback(async () => {
    try {
      const data = await listRawMedia(
        status === "todos" ? {} : { status }
      );
      setItems(data);
    } catch (e) {
      toast.error(`Erro ao carregar matéria-prima: ${String(e)}`);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function promote(item: ContentRawMediaWithGig) {
    try {
      const id = await rawMediaToContent(item.id);
      toast.success("Conteúdo criado a partir do material");
      await refresh();
      onChanged?.();
      onPromoted?.(id);
    } catch (e) {
      toast.error(`Não deu pra criar o conteúdo: ${String(e)}`);
    }
  }

  async function archive(item: ContentRawMediaWithGig) {
    await setRawMediaStatus(item.id, "arquivado");
    await refresh();
    onChanged?.();
  }

  async function remove(item: ContentRawMediaWithGig) {
    if (
      !(await confirmDialog({
        title: "Excluir material",
        description: "Excluir esta mídia? O arquivo sai do disco.",
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteRawMedia(item.id);
    toast.success("Material excluído");
    await refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={status === f.key ? "default" : "outline"}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={
            status === "novo"
              ? "Sem material novo. Fotos e clipes capturados na GIG pelo celular caem aqui."
              : "Nada aqui."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-2"
            >
              <Thumb item={m} />
              <div className="min-h-[1.25rem] text-xs text-muted-foreground">
                {m.gig_venue ? (
                  <span className="line-clamp-1">
                    {m.gig_venue}
                    {m.gig_date ? ` · ${formatDate(m.gig_date)}` : ""}
                  </span>
                ) : m.captured_at ? (
                  formatDate(m.captured_at)
                ) : (
                  "Sem GIG vinculada"
                )}
              </div>
              {m.caption && (
                <div className="line-clamp-2 text-xs">{m.caption}</div>
              )}
              <div className="mt-auto flex flex-wrap gap-1">
                {m.status !== "usado" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 px-2 text-xs"
                    onClick={() => void promote(m)}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Virar conteúdo
                  </Button>
                )}
                {m.status !== "arquivado" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Arquivar"
                    onClick={() => void archive(m)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  title="Excluir"
                  onClick={() => void remove(m)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
