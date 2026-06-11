import { useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/toaster";
import { updateGig } from "../api";
import { GIG_STATUSES, PAYMENT_STATUSES, type Gig } from "../types";

type Props = {
  gigs: Gig[];
  onRefresh: () => Promise<void> | void;
};

/** Coluna editável da planilha. */
type Col = {
  key: keyof Gig;
  label: string;
  /** Converte o valor do banco para a célula (string). */
  read: (g: Gig) => string;
  /** Converte o texto da célula para o valor a persistir (ou null para inválido). */
  parse: (raw: string) => unknown;
  width?: string;
};

const COLS: Col[] = [
  { key: "date", label: "Data", read: (g) => g.date ?? "", parse: (v) => v.trim() || null, width: "120px" },
  { key: "start_time", label: "Início", read: (g) => g.start_time ?? "", parse: (v) => v.trim() || null, width: "80px" },
  { key: "end_time", label: "Fim", read: (g) => g.end_time ?? "", parse: (v) => v.trim() || null, width: "80px" },
  { key: "event_name", label: "Evento", read: (g) => g.event_name ?? "", parse: (v) => v.trim() || null, width: "180px" },
  { key: "venue_name", label: "Local", read: (g) => g.venue_name ?? "", parse: (v) => v.trim(), width: "180px" },
  { key: "venue_city", label: "Cidade", read: (g) => g.venue_city ?? "", parse: (v) => v.trim() || null, width: "140px" },
  { key: "status", label: "Status", read: (g) => g.status, parse: (v) => (GIG_STATUSES as readonly string[]).includes(v.trim()) ? v.trim() : null, width: "120px" },
  { key: "estimated_audience", label: "Público", read: (g) => g.estimated_audience?.toString() ?? "", parse: (v) => v.trim() === "" ? null : Number(v) || null, width: "100px" },
  { key: "cache_amount", label: "Cachê", read: (g) => g.cache_amount?.toString() ?? "", parse: (v) => v.trim() === "" ? null : Number(v.replace(",", ".")) || null, width: "110px" },
  { key: "payment_status", label: "Pagamento", read: (g) => g.payment_status ?? "", parse: (v) => v.trim() === "" ? null : ((PAYMENT_STATUSES as readonly string[]).includes(v.trim()) ? v.trim() : null), width: "150px" },
  { key: "payment_method", label: "Forma pgto.", read: (g) => g.payment_method ?? "", parse: (v) => v.trim() || null, width: "130px" },
  { key: "event_category", label: "Categoria", read: (g) => g.event_category ?? "", parse: (v) => v.trim() || null, width: "130px" },
  { key: "general_notes", label: "Notas", read: (g) => g.general_notes ?? "", parse: (v) => v.trim() || null, width: "220px" },
];

type Sel = { r0: number; c0: number; r1: number; c1: number } | null;

export function SpreadsheetView({ gigs, onRefresh }: Props) {
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sel, setSel] = useState<Sel>(null);
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);

  // Sorting
  const [sortCol, setSortCol] = useState<keyof Gig | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Column visibility
  const [visibleKeys, setVisibleKeys] = useState<Set<keyof Gig>>(
    () => new Set(COLS.map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const visibleCols = useMemo(
    () => COLS.filter((c) => visibleKeys.has(c.key)),
    [visibleKeys]
  );

  // Sorted gigs
  const sortedGigs = useMemo(() => {
    if (!sortCol) return gigs;
    const col = COLS.find((c) => c.key === sortCol);
    if (!col) return gigs;
    return [...gigs].sort((a, b) => {
      const av = col.read(a);
      const bv = col.read(b);
      const an = Number(av);
      const bn = Number(bv);
      let cmp: number;
      if (!isNaN(an) && !isNaN(bn) && av !== "" && bv !== "") {
        cmp = an - bn;
      } else {
        cmp = av.localeCompare(bv, undefined, { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [gigs, sortCol, sortDir]);

  // Grade de strings derivada das GIGs (fonte da verdade são as props).
  const grid = useMemo(
    () => sortedGigs.map((g) => visibleCols.map((c) => c.read(g))),
    [sortedGigs, visibleCols]
  );

  const rect = (a: { r: number; c: number }, b: { r: number; c: number }): Sel => ({
    r0: Math.min(a.r, b.r),
    c0: Math.min(a.c, b.c),
    r1: Math.max(a.r, b.r),
    c1: Math.max(a.c, b.c),
  });

  const inSel = (r: number, c: number) =>
    sel != null && r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;

  async function persist(rowIdx: number, colIdx: number, raw: string) {
    const gig = sortedGigs[rowIdx];
    const col = visibleCols[colIdx];
    if (!gig || !col) return;
    const parsed = col.parse(raw);
    if (parsed === null && (col.key === "status" || col.key === "venue_name")) {
      if (col.key === "status") { toast.error("Status inválido"); return; }
    }
    if (col.read(gig) === raw) return;
    try {
      await updateGig({ id: gig.id, [col.key]: parsed } as Parameters<typeof updateGig>[0]);
      await onRefresh();
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    }
  }

  function startEdit(r: number, c: number) {
    setEditing({ r, c });
    setEditValue(grid[r]?.[c] ?? "");
  }

  async function commitEdit() {
    if (!editing) return;
    const { r, c } = editing;
    setEditing(null);
    await persist(r, c, editValue);
  }

  function onCellMouseDown(r: number, c: number, e: React.MouseEvent) {
    if (e.shiftKey && anchor) {
      setSel(rect(anchor, { r, c }));
    } else {
      setAnchor({ r, c });
      setSel({ r0: r, c0: c, r1: r, c1: c });
    }
  }

  function onCellMouseEnter(r: number, c: number, e: React.MouseEvent) {
    if (e.buttons === 1 && anchor) {
      setSel(rect(anchor, { r, c }));
    }
  }

  function handleCopy(e: React.ClipboardEvent) {
    if (!sel || editing) return;
    const rowsTsv: string[] = [];
    for (let r = sel.r0; r <= sel.r1; r++) {
      const cells: string[] = [];
      for (let c = sel.c0; c <= sel.c1; c++) cells.push(grid[r]?.[c] ?? "");
      rowsTsv.push(cells.join("\t"));
    }
    e.clipboardData.setData("text/plain", rowsTsv.join("\n"));
    e.preventDefault();
  }

  async function handlePaste(e: React.ClipboardEvent) {
    if (!sel || editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const matrix = text.replace(/\r/g, "").split("\n").map((line) => line.split("\t"));
    if (matrix.length > 1 && matrix[matrix.length - 1].every((c) => c === "")) matrix.pop();

    let saved = 0;
    for (let i = 0; i < matrix.length; i++) {
      const r = sel.r0 + i;
      if (r >= sortedGigs.length) break;
      for (let j = 0; j < matrix[i].length; j++) {
        const c = sel.c0 + j;
        if (c >= visibleCols.length) break;
        const gig = sortedGigs[r];
        const col = visibleCols[c];
        const raw = matrix[i][j];
        if (col.read(gig) === raw) continue;
        const parsed = col.parse(raw);
        if (col.key === "status" && parsed === null) continue;
        try {
          await updateGig({ id: gig.id, [col.key]: parsed } as Parameters<typeof updateGig>[0]);
          saved++;
        } catch { /* ignora célula */ }
      }
    }
    if (saved > 0) {
      await onRefresh();
      toast.success(`${saved} célula${saved !== 1 ? "s" : ""} coladas.`);
    }
  }

  function handleContainerKeyDown(e: React.KeyboardEvent) {
    if (editing) return;
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (!arrows.includes(e.key)) return;
    e.preventDefault();

    const maxR = sortedGigs.length - 1;
    const maxC = visibleCols.length - 1;
    if (maxR < 0 || maxC < 0) return;

    const cur = anchor ?? { r: 0, c: 0 };
    let nr = cur.r;
    let nc = cur.c;

    if (e.key === "ArrowUp") nr = Math.max(0, nr - 1);
    if (e.key === "ArrowDown") nr = Math.min(maxR, nr + 1);
    if (e.key === "ArrowLeft") nc = Math.max(0, nc - 1);
    if (e.key === "ArrowRight") nc = Math.min(maxC, nc + 1);

    setAnchor({ r: nr, c: nc });
    setSel({ r0: nr, c0: nc, r1: nr, c1: nc });
  }

  function handleHeaderClick(key: keyof Gig) {
    if (sortCol === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  }

  function toggleColVisibility(key: keyof Gig) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow hiding all columns
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // Close col picker when clicking outside
  function handleColPickerBlur(e: React.FocusEvent) {
    if (colPickerRef.current && !colPickerRef.current.contains(e.relatedTarget as Node)) {
      setShowColPicker(false);
    }
  }

  if (gigs.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nenhuma GIG para exibir na planilha.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Clique para editar. Selecione um intervalo (clique e arraste, ou shift+clique) e use Ctrl+C / Ctrl+V para copiar e colar como no Excel.
        </p>
        {/* Column visibility picker */}
        <div
          className="relative"
          ref={colPickerRef}
          onBlur={handleColPickerBlur}
        >
          <button
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
            onClick={() => setShowColPicker((v) => !v)}
          >
            Colunas
            <span className="text-muted-foreground">{showColPicker ? "▲" : "▼"}</span>
          </button>
          {showColPicker && (
            <div
              className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-md border bg-popover p-2 shadow-md"
              tabIndex={-1}
            >
              {COLS.map((col) => (
                <label
                  key={String(col.key)}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={visibleKeys.has(col.key)}
                    onChange={() => toggleColVisibility(col.key)}
                    className="accent-primary"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        className="overflow-auto rounded-md border"
        tabIndex={0}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onKeyDown={handleContainerKeyDown}
      >
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={String(col.key)}
                  className="cursor-pointer select-none border-b border-r px-2 py-1.5 text-left font-medium text-muted-foreground hover:bg-muted/80"
                  style={{ minWidth: col.width }}
                  onClick={() => handleHeaderClick(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortCol === col.key && (
                      <span className="text-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedGigs.map((_, r) => (
              <tr key={sortedGigs[r].id}>
                {visibleCols.map((col, c) => {
                  const isEditing = editing?.r === r && editing?.c === c;
                  return (
                    <td
                      key={String(col.key)}
                      className={
                        "border-b border-r px-2 py-1 align-top select-none " +
                        (inSel(r, c) ? "bg-primary/15 ring-1 ring-inset ring-primary/40 " : "")
                      }
                      onMouseDown={(e) => onCellMouseDown(r, c, e)}
                      onMouseEnter={(e) => onCellMouseEnter(r, c, e)}
                      onDoubleClick={() => startEdit(r, c)}
                      onClick={(e) => { if (e.detail === 1 && !isEditing) { /* selection handled in mousedown */ } }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="w-full bg-background outline-none ring-1 ring-primary rounded px-1"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => void commitEdit()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); void commitEdit(); }
                            if (e.key === "Escape") { setEditing(null); }
                          }}
                        />
                      ) : (
                        <span className="block min-h-[1.1rem] cursor-cell whitespace-pre-wrap break-words">
                          {grid[r]?.[c]}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
