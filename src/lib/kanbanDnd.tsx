import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop de kanban baseado em pointer events (não no DnD nativo do
 * HTML5, que é instável no WebKit/Tauri). Os cards iniciam o arraste em
 * qualquer ponto; ao soltar, descobrimos por hit-test qual coluna está sob o
 * cursor e disparamos `onMove(id, novoStatus)`. Um clique simples (sem passar
 * do threshold) continua abrindo o card normalmente.
 *
 * Seleção múltipla: Shift+clique marca/desmarca cards. Ao arrastar um card que
 * faz parte da seleção, todos os selecionados se movem juntos para a coluna
 * destino.
 */

type Ctx = {
  draggingId: number | null;
  overStatus: string | null;
  selectedIds: Set<number>;
  registerColumn: (status: string, el: HTMLElement | null) => void;
  startDrag: (
    e: React.PointerEvent,
    id: number,
    onClick?: () => void
  ) => void;
};

const KanbanCtx = createContext<Ctx | null>(null);

const THRESHOLD = 6;

export function KanbanBoard({
  onMove,
  children,
  className,
}: {
  onMove: (id: number, status: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const cols = useRef<Map<string, HTMLElement>>(new Map());
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    active: boolean;
    onClick?: () => void;
  } | null>(null);
  const justDragged = useRef(false);
  // mantém a seleção acessível dentro dos handlers sem recriá-los
  const selectedRef = useRef<Set<number>>(selectedIds);
  selectedRef.current = selectedIds;

  const registerColumn = useCallback((status: string, el: HTMLElement | null) => {
    if (el) cols.current.set(status, el);
    else cols.current.delete(status);
  }, []);

  function columnAt(x: number, y: number): string | null {
    for (const [status, el] of cols.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return status;
      }
    }
    return null;
  }

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent, id: number, onClick?: () => void) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // Shift+clique: alterna seleção, não inicia arraste nem abre o card
      if (e.shiftKey) {
        toggleSelect(id);
        drag.current = null;
        return;
      }
      drag.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        onClick,
      };
    },
    [toggleSelect]
  );

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      d.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDraggingId(d.id);
    }
    setOverStatus(columnAt(e.clientX, e.clientY));
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!d.active) {
      justDragged.current = false;
      // clique simples num card: limpa a seleção e abre
      if (selectedRef.current.size > 0) setSelectedIds(new Set());
      d.onClick?.();
      return;
    }
    justDragged.current = true;
    const target = columnAt(e.clientX, e.clientY);
    setDraggingId(null);
    setOverStatus(null);
    if (target) {
      const selected = selectedRef.current;
      // Se o card arrastado faz parte da seleção, move todos os selecionados.
      if (selected.has(d.id) && selected.size > 1) {
        for (const id of selected) onMove(id, target);
      } else {
        onMove(d.id, target);
      }
      setSelectedIds(new Set());
    }
  }

  return (
    <KanbanCtx.Provider
      value={{ draggingId, overStatus, selectedIds, registerColumn, startDrag }}
    >
      <div
        className={className}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </KanbanCtx.Provider>
  );
}

export function KanbanColumn({
  status,
  children,
  className,
  style,
}: {
  status: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ctx = useContext(KanbanCtx);
  const isOver = ctx?.overStatus === status && ctx?.draggingId !== null;
  return (
    <div
      ref={(el) => ctx?.registerColumn(status, el)}
      className={cn(className, isOver && "ring-2 ring-primary ring-offset-1")}
      style={style}
    >
      {children}
    </div>
  );
}

export function KanbanCard({
  id,
  onClick,
  children,
  className,
}: {
  id: number;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(KanbanCtx);
  const isDragging = ctx?.draggingId === id;
  const isSelected = ctx?.selectedIds.has(id) ?? false;
  return (
    <div
      onPointerDown={(e) => ctx?.startDrag(e, id, onClick)}
      className={cn(
        "cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-50",
        isSelected && "ring-2 ring-primary ring-offset-1",
        className
      )}
    >
      {children}
    </div>
  );
}
