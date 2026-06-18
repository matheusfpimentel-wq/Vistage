import { CONTACT_TYPES, type ContactType } from "../types";

/** Ordem canônica: segue CONTACT_TYPES; tipos livres ao fim em ordem alfabética. */
export function sortContactTypes(types: ContactType[]): ContactType[] {
  return [...types].sort((a, b) => {
    const ia = CONTACT_TYPES.indexOf(a as (typeof CONTACT_TYPES)[number]);
    const ib = CONTACT_TYPES.indexOf(b as (typeof CONTACT_TYPES)[number]);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "pt-BR");
  });
}

export function TypeBadges({ types }: { types: ContactType[] }) {
  if (types.length === 0) {
    return <span className="text-xs text-muted-foreground">sem tipo</span>;
  }
  return (
    <div className="inline-flex flex-wrap gap-1">
      {sortContactTypes(types).map((t) => (
        <span
          key={t}
          className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 whitespace-nowrap"
        >
          {t}
        </span>
      ))}
    </div>
  );
}
