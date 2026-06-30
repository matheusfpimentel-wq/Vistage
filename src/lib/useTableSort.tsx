import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc" | null;

export function useTableSort<T>(
  rows: T[],
  initialKey: keyof T | null = null,
  initialDir: SortDir = null
) {
  const [sortKey, setSortKey] = useState<keyof T | null>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  function handleSort(key: keyof T) {
    if (sortKey === key) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else { setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv, "pt-BR")
        : (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, handleSort };
}

export function SortableHeader<T>({
  col, label, sortKey, sortDir, onSort, className, children,
}: {
  col: keyof T; label: string; sortKey: keyof T | null;
  sortDir: SortDir; onSort: (k: keyof T) => void; className?: string;
  /** Conteúdo extra posicionado no th (ex.: alça de redimensionamento). */
  children?: React.ReactNode;
}) {
  const active = sortKey === col;
  return (
    <th className={cn("relative cursor-pointer select-none", className)} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1 truncate align-middle">
        {label}
        {active && sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" />
          : active && sortDir === "desc" ? <ChevronDown className="h-3 w-3 shrink-0" />
          : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />}
      </span>
      {children}
    </th>
  );
}
