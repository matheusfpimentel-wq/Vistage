import type { ContactType } from "../types";

export function TypeBadges({ types }: { types: ContactType[] }) {
  if (types.length === 0) {
    return <span className="text-xs text-muted-foreground">sem tipo</span>;
  }
  return (
    <div className="inline-flex flex-wrap gap-1">
      {types.map((t) => (
        <span
          key={t}
          className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground whitespace-nowrap"
        >
          {t}
        </span>
      ))}
    </div>
  );
}
