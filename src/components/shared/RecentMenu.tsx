import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { Link } from "react-router-dom";
import { loadRecentlyEdited, RECENT_KIND_LABEL, type RecentItem } from "@/lib/recent";

function timeAgo(iso: string): string {
  const then = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return "";
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}

export function RecentMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      loadRecentlyEdited(8).then(setItems).catch(() => setItems([]));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md transition hover:bg-accent"
        aria-label="Continuar de onde parei"
        title="Continuar de onde parei"
      >
        <History className="h-5 w-5 sm:h-4 sm:w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border bg-popover shadow-lg">
          <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            Continuar de onde parei
          </p>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nada editado ainda.
            </p>
          ) : (
            <div className="py-1">
              {items.map((it) => (
                <Link
                  key={`${it.kind}-${it.id}`}
                  to={it.route}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-accent"
                >
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {RECENT_KIND_LABEL[it.kind]}
                  </span>
                  <span className="flex-1 truncate font-medium">{it.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(it.updated_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
