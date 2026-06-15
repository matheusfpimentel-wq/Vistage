import { Badge } from "@/components/ui/badge";
import {
  CONTENT_STATUSES,
  contentStatusVariant,
  type Content,
  type ContentStatus,
} from "../types";
import { formatDate } from "@/lib/format";

type Props = {
  items: Content[];
  onEdit: (c: Content) => void;
};

export function ContentKanban({ items, onEdit }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {CONTENT_STATUSES.map((status) => (
        <Column
          key={status}
          status={status}
          items={items.filter((c) => c.status === status)}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

function Column({
  status,
  items,
  onEdit,
}: {
  status: ContentStatus;
  items: Content[];
  onEdit: (c: Content) => void;
}) {
  return (
    <div className="flex flex-col rounded-md border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium flex items-center gap-2">
          <Badge variant={contentStatusVariant(status)}>{status}</Badge>
        </div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {items.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            sem itens
          </div>
        )}
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onEdit(c)}
            className="w-full rounded-md border bg-background p-2 text-left text-sm transition hover:border-primary"
          >
            <div className="font-medium">{c.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {c.format && (
                <Badge variant="outline" className="text-xs">
                  {c.format}
                </Badge>
              )}
              {c.networks.slice(0, 2).map((n) => (
                <Badge key={n} variant="secondary" className="text-xs">
                  {n}
                </Badge>
              ))}
              {c.publish_date && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  · {formatDate(c.publish_date, "dd/MM")}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
