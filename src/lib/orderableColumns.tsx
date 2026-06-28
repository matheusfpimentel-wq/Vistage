import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { persistDocSetting } from "@/lib/docSettings";
import type { SortDir } from "@/lib/useTableSort";

/**
 * Reordenação de colunas (arrastar o cabeçalho pra mover) para tabelas/listas.
 *
 * A coluna PRINCIPAL e as utilitárias (ex.: ações) ficam TRAVADAS: nunca mudam
 * de posição. Só as colunas do meio (não travadas) reordenam entre si.
 *
 * Modelo de persistência igual ao das larguras (useResizableColumns): a ordem
 * vai pra document_settings via persistDocSetting na chave
 * `vistage.cols.order.${key}` — o prefixo `vistage.cols.` é PORTÁTIL, então a
 * ordem viaja no .vistage e é re-hidratada no boot.
 *
 * Como as travadas são ancoradas POR POSIÇÃO (sempre no índice em que aparecem
 * na lista `columns`), só persistimos a sequência das NÃO travadas. Ao montar,
 * intercalamos: caminhamos pelos índices de `columns`; onde há uma travada,
 * emitimos a travada; onde há uma móvel, emitimos a próxima da ordem do usuário.
 * Assim o cabeçalho e o corpo (que mapeiam pela MESMA `order`) nunca dessincronizam.
 *
 * Uso:
 *   const oc = useOrderableColumns("gigs", [
 *     { id: "date" },
 *     { id: "name", locked: true },   // principal — travada
 *     { id: "contractor" },
 *     { id: "actions", locked: true },// utilitária — travada
 *   ]);
 *   <thead>
 *     <OrderableHeader oc={oc}>
 *       <tr>{oc.order.map((id) => <SortableTh key={id} id={id} locked={oc.isLocked(id)}>…</SortableTh>)}</tr>
 *     </OrderableHeader>
 *   </thead>
 *   // No corpo, mapeie pela MESMA ordem: oc.order.map((id) => <td key={id}>…</td>)
 */

export type OrderableColumn = {
  /** identificador estável da coluna (usado na persistência e como key) */
  id: string;
  /** travada: posição fixa, não arrastável (ex.: campo principal, ações) */
  locked?: boolean;
};

/**
 * Intercala a ordem do usuário (só ids NÃO travados) com as travadas ancoradas
 * nas posições em que aparecem em `columns`. Ids desconhecidos são ignorados;
 * ids móveis ausentes na ordem salva entram na posição default (ordem de `columns`).
 */
function buildEffectiveOrder(columns: OrderableColumn[], savedMovable: string[]): string[] {
  const movableDefault = columns.filter((c) => !c.locked).map((c) => c.id);
  const movableSet = new Set(movableDefault);
  // Reconcilia: mantém só ids móveis conhecidos, na ordem salva…
  const movable = savedMovable.filter((id) => movableSet.has(id));
  // …e adiciona ids móveis novos na posição default (ordem de `columns`).
  for (const id of movableDefault) if (!movable.includes(id)) movable.push(id);

  // Caminha pelos slots de `columns`: travada → ela mesma; móvel → próxima do usuário.
  const out: string[] = [];
  let mi = 0;
  for (const c of columns) {
    if (c.locked) out.push(c.id);
    else out.push(movable[mi++]);
  }
  return out;
}

export function useOrderableColumns(key: string, columns: OrderableColumn[]) {
  const storageKey = `vistage.cols.order.${key}`;
  // Snapshot estável das colunas pra reconciliar sem depender de identidade do array.
  const colsRef = useRef(columns);
  colsRef.current = columns;
  const lockedSet = useMemo(() => new Set(columns.filter((c) => c.locked).map((c) => c.id)), [columns]);

  const [order, setOrder] = useState<string[]>(() => {
    let saved: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) saved = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* ignora json inválido */
    }
    return buildEffectiveOrder(colsRef.current, saved);
  });

  const isLocked = useCallback((id: string) => lockedSet.has(id), [lockedSet]);

  const persist = useCallback(
    (effective: string[]) => {
      // Persiste só a sequência das NÃO travadas (as travadas são por posição).
      const movable = effective.filter((id) => !lockedSet.has(id));
      persistDocSetting(storageKey, JSON.stringify(movable));
    },
    [storageKey, lockedSet]
  );

  // distance:5 → um CLIQUE no cabeçalho ainda ordena (sort); só um ARRASTO (>5px) move.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const fromId = String(active.id);
      const toId = String(over.id);
      // Só reordena se AMBAS forem não travadas — travadas têm posição fixa.
      if (lockedSet.has(fromId) || lockedSet.has(toId)) return;
      setOrder((prev) => {
        const oldIndex = prev.indexOf(fromId);
        const newIndex = prev.indexOf(toId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        persist(next);
        return next;
      });
    },
    [lockedSet, persist]
  );

  return {
    /** ids na ordem efetiva (travadas nas posições fixas) — mapeie header E corpo por isto. */
    order,
    isLocked,
    // Internos consumidos pelo <OrderableHeader>; não precisam ser usados à mão.
    _sensors: sensors,
    _onDragEnd: onDragEnd,
  };
}

export type OrderableColumnsApi = ReturnType<typeof useOrderableColumns>;

/**
 * Envolve a linha (`<tr>`) de cabeçalho com o DnD do dnd-kit. Nem o DndContext
 * nem o SortableContext renderizam um nó DOM, então é seguro colocar entre
 * `<thead>` e `<tr>`. Mantém o consumidor sem precisar importar dnd-kit.
 *
 *   <thead><OrderableHeader oc={oc}><tr>…SortableTh…</tr></OrderableHeader></thead>
 */
export function OrderableHeader({
  oc,
  children,
}: {
  oc: OrderableColumnsApi;
  children: React.ReactNode;
}) {
  return (
    <DndContext sensors={oc._sensors} collisionDetection={closestCenter} onDragEnd={oc._onDragEnd}>
      <SortableContext items={oc.order} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * `<th>` arrastável para reordenar colunas. Quando `locked`, NÃO recebe os
 * listeners do dnd-kit (fica fixo) mas ainda participa do layout normal.
 *
 * Mantém compatibilidade com:
 *  - ordenação por clique (passe `onClick`; o arrasto só dispara além de 5px);
 *  - alça de redimensionamento <ColResizer> (renderize como child; ela já chama
 *    stopPropagation no clique e no pointerdown, evitando iniciar um arrasto);
 *  - conteúdo ordenável via <SortLabel> (rótulo + chevron) dentro do children.
 */
export function SortableTh({
  id,
  locked,
  className,
  onClick,
  title,
  children,
}: {
  id: string;
  locked?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
  });
  const style: React.CSSProperties = {
    // Translate (não Transform) pra não distorcer a largura da coluna ao arrastar.
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    cursor: locked ? undefined : "grab",
  };
  return (
    <th
      ref={setNodeRef}
      style={style}
      className={cn("relative select-none", className)}
      onClick={onClick}
      title={title}
      // Travada: th comum (sem role/listeners de arrasto), só ordena por clique.
      {...(locked ? {} : attributes)}
      {...(locked ? {} : listeners)}
    >
      {children}
    </th>
  );
}

/**
 * Conteúdo de um cabeçalho ORDENÁVEL (rótulo + chevron de direção), pra usar
 * dentro de <SortableTh> quando a coluna também ordena por clique. Espelha o
 * visual do <SortableHeader> de useTableSort, mas sem renderizar o próprio <th>
 * (quem renderiza é o SortableTh, que precisa do ref/listeners do dnd-kit).
 */
export function SortLabel({ label, active, dir }: { label: string; active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex items-center gap-1 truncate align-middle">
      {label}
      {active && dir === "asc" ? (
        <ChevronUp className="h-3 w-3 shrink-0" />
      ) : active && dir === "desc" ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />
      )}
    </span>
  );
}
