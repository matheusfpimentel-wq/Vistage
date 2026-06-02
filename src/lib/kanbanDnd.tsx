import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop de kanban baseado em pointer events (não no DnD nativo do
 * HTML5, que é instável no WebKit/Tauri). Os cards iniciam o arraste em
 * qualquer ponto; ao soltar, descobrimos por hit-test qual coluna está sob o
 * cursor e disparamos `onMove(id, novoStatus)`. Um clique simples (sem passar
 * do threshold) continua abrindo o card normalmente.
 */

type Ctx = {
  draggingId: number | null;
  overStatus: string | null;
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
  const cols = useRef<Map<string, HTMLElement>>(new Map());
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    active: boolean;
    onClick?: () => void;
  } | null>(null);
  const justDragged = useRef(false);

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

  const startDrag = useCallback(
    (e: React.PointerEvent, id: number, onClick?: () => void) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      drag.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        onClick,
      };
    },
    []
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
      d.onClick?.();
      return;
    }
    justDragged.current = true;
    const target = columnAt(e.clientX, e.clientY);
    setDraggingId(null);
    setOverStatus(null);
    if (target) onMove(d.id, target);
  }

  return (
    <KanbanCtx.Provider
      value={{ draggingId, overStatus, registerColumn, startDrag }}
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
}: {
  status: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(KanbanCtx);
  const isOver = ctx?.overStatus === status && ctx?.draggingId !== null;
  return (
    <div
      ref={(el) => ctx?.registerColumn(status, el)}
      className={cn(className, isOver && "ring-2 ring-primary ring-offset-1")}
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
  return (
    <div
      onPointerDown={(e) => ctx?.startDrag(e, id, onClick)}
      className={cn(
        "cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-50",
        className
      )}
    >
      {children}
    </div>
  );
}
