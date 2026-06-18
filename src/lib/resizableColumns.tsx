import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ColumnDef = {
  /** identificador estável da coluna (usado na persistência) */
  id: string;
  /** largura inicial em px */
  width: number;
  /** largura mínima em px (padrão 60) */
  min?: number;
};

type Drag = { id: string; startX: number; startW: number; min: number };

/**
 * Colunas redimensionáveis para tabelas HTML nativas. As larguras ficam num
 * `<colgroup>` (table-fixed) e persistem em localStorage por `key`. Arrastar a
 * alça no canto direito do cabeçalho redimensiona; duplo-clique reseta a coluna.
 *
 * Uso:
 *   const cols = useResizableColumns("fans", [{ id: "name", width: 240 }, ...]);
 *   <table className="w-full table-fixed">
 *     <colgroup>{cols.defs.map((c) => <col key={c.id} style={cols.colStyle(c.id)} />)}</colgroup>
 *     <thead><tr>
 *       <th className="relative ...">Nome<ColResizer {...cols.resizer("name")} /></th>
 *       ...
 */
export function useResizableColumns(key: string, columns: ColumnDef[]) {
  const storageKey = `vistage.cols.${key}`;
  const defaults = useRef<Record<string, number>>(
    Object.fromEntries(columns.map((c) => [c.id, c.width]))
  );

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const init = { ...defaults.current };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      for (const c of columns) {
        if (typeof saved[c.id] === "number" && saved[c.id] > 0) init[c.id] = saved[c.id];
      }
    } catch {
      /* ignora json inválido */
    }
    return init;
  });

  const drag = useRef<Drag | null>(null);
  const latest = useRef(widths);
  latest.current = widths;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(latest.current));
    } catch {
      /* storage cheio/indisponível — ignora */
    }
  }, [storageKey]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = drag.current;
      if (!d) return;
      const next = Math.max(d.min, d.startW + (e.clientX - d.startX));
      setWidths((prev) => ({ ...prev, [d.id]: next }));
    }
    function onUp() {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persist();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [persist]);

  const startResize = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const def = columns.find((c) => c.id === id);
      drag.current = {
        id,
        startX: e.clientX,
        startW: latest.current[id] ?? def?.width ?? 120,
        min: def?.min ?? 60,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [columns]
  );

  const resetColumn = useCallback(
    (id: string) => {
      setWidths((prev) => ({ ...prev, [id]: defaults.current[id] }));
      // persiste no próximo tick (latest.current já refletirá o reset)
      requestAnimationFrame(persist);
    },
    [persist]
  );

  return {
    defs: columns,
    widths,
    colStyle: (id: string): React.CSSProperties => ({ width: widths[id] }),
    resizer: (id: string) => ({
      onMouseDown: (e: React.MouseEvent) => startResize(id, e),
      onDoubleClick: () => resetColumn(id),
    }),
  };
}

/** Alça de redimensionamento — renderize dentro de um `<th class="relative">`. */
export function ColResizer({
  onMouseDown,
  onDoubleClick,
  className,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  className?: string;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar coluna"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none select-none items-stretch justify-center",
        "after:my-1 after:w-px after:bg-border after:transition-colors hover:after:bg-primary hover:after:w-0.5",
        className
      )}
    />
  );
}
