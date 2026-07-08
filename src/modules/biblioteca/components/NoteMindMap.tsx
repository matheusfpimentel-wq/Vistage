import { useEffect, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "../notesApi";

// Mapa mental das notas — SVG leve, sem lib de grafo (só pointer events). Nós
// arrastáveis (posição grava em notes.graph_x/y), ligações direcionadas: as
// automáticas vêm de [[wikilink]] (não dá pra apagar aqui), as manuais são
// desenhadas puxando pela alça e podem ser removidas pelo "×".

const NODE_W = 148;
const NODE_H = 46;

type Pos = { x: number; y: number };

export function NoteMindMap({
  nodes,
  edges,
  selectedId,
  onSelect,
  onMove,
  onCreateLink,
  onDeleteLink,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onMove: (id: number, x: number, y: number) => void;
  onCreateLink: (source: number, target: number) => void;
  onDeleteLink: (source: number, target: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [positions, setPositions] = useState<Record<number, Pos>>({});
  const dragRef = useRef<null | { id: number; dx: number; dy: number; moved: boolean }>(null);
  const linkRef = useRef<null | { source: number }>(null);
  const [linkCursor, setLinkCursor] = useState<Pos | null>(null);

  // Semeia posições: usa graph_x/y salvo; senão, grade determinística por índice.
  // Mantém as posições locais já existentes (não reseta durante a sessão).
  useEffect(() => {
    setPositions((prev) => {
      const next: Record<number, Pos> = {};
      const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
      nodes.forEach((n, i) => {
        if (prev[n.id]) {
          next[n.id] = prev[n.id];
        } else if (n.graph_x != null && n.graph_y != null) {
          next[n.id] = { x: n.graph_x, y: n.graph_y };
        } else {
          next[n.id] = { x: 40 + (i % cols) * 200, y: 40 + Math.floor(i / cols) * 120 };
        }
      });
      return next;
    });
  }, [nodes]);

  function toSvg(e: React.PointerEvent): Pos {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function nodeAt(x: number, y: number): number | null {
    for (const n of nodes) {
      const p = positions[n.id];
      if (!p) continue;
      if (x >= p.x && x <= p.x + NODE_W && y >= p.y && y <= p.y + NODE_H) return n.id;
    }
    return null;
  }

  function onNodeDown(e: React.PointerEvent, id: number) {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toSvg(e);
    const pos = positions[id] ?? { x: 0, y: 0 };
    dragRef.current = { id, dx: p.x - pos.x, dy: p.y - pos.y, moved: false };
  }

  function onHandleDown(e: React.PointerEvent, id: number) {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    linkRef.current = { source: id };
    setLinkCursor(toSvg(e));
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const p = toSvg(e);
      const { id, dx, dy } = dragRef.current;
      dragRef.current.moved = true;
      setPositions((prev) => ({ ...prev, [id]: { x: p.x - dx, y: p.y - dy } }));
    } else if (linkRef.current) {
      setLinkCursor(toSvg(e));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragRef.current) {
      const { id, dx, dy, moved } = dragRef.current;
      dragRef.current = null;
      if (moved) {
        const p = toSvg(e);
        onMove(id, Math.round(p.x - dx), Math.round(p.y - dy));
      } else {
        onSelect(id);
      }
    } else if (linkRef.current) {
      const { source } = linkRef.current;
      linkRef.current = null;
      setLinkCursor(null);
      const p = toSvg(e);
      const target = nodeAt(p.x, p.y);
      if (target != null && target !== source) onCreateLink(source, target);
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Crie notas pra montar o mapa.
      </div>
    );
  }

  const width = Math.max(
    480,
    ...Object.values(positions).map((p) => p.x + NODE_W)
  ) + 60;
  const height = Math.max(
    320,
    ...Object.values(positions).map((p) => p.y + NODE_H)
  ) + 60;

  return (
    <div className="overflow-auto rounded-md border bg-muted/20" style={{ maxHeight: "72vh" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <marker id="mm-arrow-auto" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
          <marker id="mm-arrow-manual" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--primary))" />
          </marker>
        </defs>

        {/* Arestas */}
        {edges.map((edge, i) => {
          const sp = positions[edge.source_note_id];
          const tp = positions[edge.target_note_id];
          if (!sp || !tp) return null;
          const sx = sp.x + NODE_W / 2;
          const sy = sp.y + NODE_H / 2;
          const tx = tp.x + NODE_W / 2;
          const ty = tp.y + NODE_H / 2;
          const ang = Math.atan2(ty - sy, tx - sx);
          const bx = sx + Math.cos(ang) * 34;
          const by = sy + Math.sin(ang) * 26;
          const ex = tx - Math.cos(ang) * 34;
          const ey = ty - Math.sin(ang) * 26;
          const manual = edge.manual === 1;
          const mx = (bx + ex) / 2;
          const my = (by + ey) / 2;
          return (
            <g key={`${edge.source_note_id}-${edge.target_note_id}-${i}`}>
              <line
                x1={bx}
                y1={by}
                x2={ex}
                y2={ey}
                stroke={manual ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                strokeOpacity={manual ? 0.9 : 0.45}
                strokeWidth={manual ? 2 : 1.5}
                strokeDasharray={manual ? undefined : "4 3"}
                markerEnd={`url(#${manual ? "mm-arrow-manual" : "mm-arrow-auto"})`}
              />
              {manual && (
                <g
                  className="cursor-pointer"
                  onClick={() => onDeleteLink(edge.source_note_id, edge.target_note_id)}
                >
                  <title>Remover ligação manual</title>
                  <circle cx={mx} cy={my} r={7} fill="hsl(var(--background))" stroke="hsl(var(--primary))" />
                  <path d={`M${mx - 3},${my - 3} L${mx + 3},${my + 3} M${mx + 3},${my - 3} L${mx - 3},${my + 3}`} stroke="hsl(var(--primary))" strokeWidth={1.4} />
                </g>
              )}
            </g>
          );
        })}

        {/* Linha temporária ao criar ligação */}
        {linkRef.current && linkCursor && positions[linkRef.current.source] && (
          <line
            x1={positions[linkRef.current.source].x + NODE_W / 2}
            y1={positions[linkRef.current.source].y + NODE_H / 2}
            x2={linkCursor.x}
            y2={linkCursor.y}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        )}

        {/* Nós */}
        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return null;
          const selected = n.id === selectedId;
          const title = n.title || "(sem título)";
          const short = title.length > 18 ? title.slice(0, 17) + "…" : title;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={n.color ? n.color : "hsl(var(--card))"}
                fillOpacity={n.color ? 0.18 : 1}
                stroke={selected ? "hsl(var(--primary))" : n.color ? n.color : "hsl(var(--border))"}
                strokeWidth={selected ? 2.5 : 1.5}
                className="cursor-grab"
                onPointerDown={(e) => onNodeDown(e, n.id)}
              />
              {n.color && (
                <circle cx={14} cy={NODE_H / 2} r={4} fill={n.color} pointerEvents="none" />
              )}
              <text
                x={n.color ? 26 : NODE_W / 2}
                y={NODE_H / 2}
                textAnchor={n.color ? "start" : "middle"}
                dominantBaseline="central"
                fontSize={12.5}
                fill="hsl(var(--foreground))"
                pointerEvents="none"
              >
                {short}
              </text>
              {/* Alça de ligação (puxe pra outra nota) */}
              <circle
                cx={NODE_W}
                cy={NODE_H / 2}
                r={6}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
                className="cursor-crosshair"
                onPointerDown={(e) => onHandleDown(e, n.id)}
              >
                <title>Puxe pra ligar a outra nota</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
