import { CalendarClock, ExternalLink, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import { contentStatusVariant, type Content } from "../types";
import { formatDate } from "@/lib/format";
import type { ListDensity } from "@/components/shared/ListDensityToggle";

type Props = {
  items: Content[];
  onEdit: (c: Content) => void;
  onDelete: (c: Content) => void;
  density?: ListDensity;
};

export function ContentList({ items, onEdit, onDelete, density = "full" }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Nenhum conteúdo encontrado.
      </div>
    );
  }
  const compact = density === "compact";
  return (
    <div className={compact ? "space-y-0.5" : "space-y-1.5"}>
      {items.map((c) => (
        <div
          key={c.id}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-md border transition-colors hover:bg-muted/40",
            compact ? "p-2" : "p-3"
          )}
          onClick={() => onEdit(c)}
          title="Clique pra editar"
        >
          <div className={cn("flex-1", compact ? "min-w-0" : "space-y-1.5")}>
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(c);
                }}
                className="text-left text-sm font-medium hover:underline"
              >
                {c.title}
              </button>
              <div className="flex items-center gap-1.5">
                {compact && c.due_date && (
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {formatDate(c.due_date)}
                  </span>
                )}
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

            {!compact && c.purpose && (
              <p className="text-xs text-muted-foreground">{c.purpose}</p>
            )}

            {!compact && (
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
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternal(c.post_url!).catch(() => {});
                  }}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  link <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {c.engagement_notes && (
                <span
                  className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                  title={c.engagement_notes}
                >
                  <MessageSquare className="h-3 w-3" />
                  Ver resultado
                </span>
              )}
            </div>
            )}
          </div>

          <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
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
