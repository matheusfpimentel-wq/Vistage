import { CalendarClock, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { contentStatusVariant, type Content } from "../types";
import { formatDate } from "@/lib/format";

type Props = {
  items: Content[];
  onEdit: (c: Content) => void;
  onDelete: (c: Content) => void;
};

export function ContentList({ items, onEdit, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Nenhum conteúdo encontrado.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {items.map((c) => (
        <div
          key={c.id}
          className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
        >
          <div className="flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => onEdit(c)}
                className="text-left text-sm font-medium hover:underline"
              >
                {c.title}
              </button>
              <div className="flex items-center gap-1.5">
                <Badge variant={contentStatusVariant(c.status)}>
                  {c.status}
                </Badge>
                {c.format && (
                  <Badge variant="outline" className="text-xs">
                    {c.format}
                  </Badge>
                )}
              </div>
            </div>

            {c.purpose && (
              <p className="text-xs text-muted-foreground">{c.purpose}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {c.networks.map((n) => (
                <Badge key={n} variant="secondary">
                  {n}
                </Badge>
              ))}
              {c.due_date && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <CalendarClock className="h-3 w-3" />
                  prazo {formatDate(c.due_date)}
                </span>
              )}
              {c.publish_date && (
                <span className="tabular-nums">
                  publicar {formatDate(c.publish_date)}
                </span>
              )}
              {c.post_url && (
                <button
                  onClick={() =>
                    openExternal(c.post_url!).catch(() => {})
                  }
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  link <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(c)}
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(c)}
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
