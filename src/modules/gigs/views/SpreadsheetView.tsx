import { useMemo, useState } from "react";
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

  // Grade de strings derivada das GIGs (fonte da verdade são as props).
  const grid = useMemo(
    () => gigs.map((g) => COLS.map((c) => c.read(g))),
    [gigs]
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
    const gig = gigs[rowIdx];
    const col = COLS[colIdx];
    if (!gig) return;
    const parsed = col.parse(raw);
    if (parsed === null && (col.key === "status" || col.key === "venue_name")) {
      // status/local não podem virar nulos inválidos — ignora
      if (col.key === "status") { toast.error("Status inválido"); return; }
    }
    if (col.read(gig) === raw) return; // sem mudança
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
    // remove última linha vazia gerada por \n final
    if (matrix.length > 1 && matrix[matrix.length - 1].every((c) => c === "")) matrix.pop();

    let saved = 0;
    for (let i = 0; i < matrix.length; i++) {
      const r = sel.r0 + i;
      if (r >= gigs.length) break;
      for (let j = 0; j < matrix[i].length; j++) {
        const c = sel.c0 + j;
        if (c >= COLS.length) break;
        const gig = gigs[r];
        const col = COLS[c];
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

  if (gigs.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nenhuma GIG para exibir na planilha.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Clique para editar. Selecione um intervalo (clique e arraste, ou shift+clique) e use Ctrl+C / Ctrl+V para copiar e colar como no Excel.
      </p>
      <div
        className="overflow-auto rounded-md border"
        tabIndex={0}
        onCopy={handleCopy}
        onPaste={handlePaste}
      >
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {COLS.map((col) => (
                <th
                  key={String(col.key)}
                  className="border-b border-r px-2 py-1.5 text-left font-medium text-muted-foreground"
                  style={{ minWidth: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gigs.map((_, r) => (
              <tr key={gigs[r].id}>
                {COLS.map((col, c) => {
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
