import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Network, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import {
  buildMindGraph,
  MIND_TYPE_META,
  type MindGraph,
  type MindNode,
  type MindNodeType,
} from "./mindmap";

/** Posição/velocidade de cada nó na simulação de forças. */
type Particle = { x: number; y: number; vx: number; vy: number };

const WIDTH = 1600;
const HEIGHT = 1200;

export function MindMapPage() {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<MindGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<MindNodeType>>(new Set());
  const [hover, setHover] = useState<string | null>(null);

  // viewport (pan/zoom)
  const [view, setView] = useState({ x: 0, y: 0, k: 0.85 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // posições mantidas fora do estado React (atualizadas a cada frame)
  const posRef = useRef<Map<string, Particle>>(new Map());
  const draggingRef = useRef<string | null>(null);
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGraph(await buildMindGraph());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [load]);

  // grafo visível conforme filtros de módulo
  const visible = useMemo(() => {
    if (!graph) return { nodes: [] as MindNode[], edges: [] as MindGraph["edges"] };
    const nodes = graph.nodes.filter((n) => !hidden.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  }, [graph, hidden]);

  // grau de cada nó (para tamanho do círculo)
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    visible.edges.forEach((e) => {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    });
    return d;
  }, [visible.edges]);

  // (re)inicializa posições quando o conjunto de nós muda
  useEffect(() => {
    const pos = posRef.current;
    const present = new Set(visible.nodes.map((n) => n.id));
    for (const key of [...pos.keys()]) if (!present.has(key)) pos.delete(key);
    // distribui novos nós num círculo agrupado por tipo
    const byType = new Map<MindNodeType, number>();
    visible.nodes.forEach((n, i) => {
      if (pos.has(n.id)) return;
      const ti = (byType.get(n.type) ?? 0) + 1;
      byType.set(n.type, ti);
      const angle = (i / Math.max(1, visible.nodes.length)) * Math.PI * 2;
      const r = 200 + ti * 18;
      pos.set(n.id, {
        x: WIDTH / 2 + Math.cos(angle) * r,
        y: HEIGHT / 2 + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      });
    });
    alphaRef.current = 1; // reaquece a simulação
  }, [visible.nodes]);

  // loop de simulação de forças (repulsão + molas + gravidade central)
  useEffect(() => {
    if (visible.nodes.length === 0) return;
    const pos = posRef.current;

    function step() {
      const nodes = visible.nodes;
      const alpha = alphaRef.current;

      if (alpha > 0.005) {
        // repulsão entre todos os pares
        for (let i = 0; i < nodes.length; i++) {
          const a = pos.get(nodes[i].id);
          if (!a) continue;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = pos.get(nodes[j].id);
            if (!b) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let dist2 = dx * dx + dy * dy;
            if (dist2 < 1) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              dist2 = 1;
            }
            const force = 9000 / dist2;
            const dist = Math.sqrt(dist2);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        // molas ao longo das arestas
        for (const e of visible.edges) {
          const a = pos.get(e.source);
          const b = pos.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const k = (dist - 160) * 0.02;
          const fx = (dx / dist) * k;
          const fy = (dy / dist) * k;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        // gravidade para o centro + integração
        for (const n of nodes) {
          const p = pos.get(n.id);
          if (!p) continue;
          if (draggingRef.current === n.id) {
            p.vx = 0;
            p.vy = 0;
            continue;
          }
          p.vx += (WIDTH / 2 - p.x) * 0.002;
          p.vy += (HEIGHT / 2 - p.y) * 0.002;
          p.vx *= 0.85;
          p.vy *= 0.85;
          p.x += p.vx * alpha;
          p.y += p.vy * alpha;
        }
        alphaRef.current = alpha * 0.99;
        forceTick((t) => t + 1);
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible.nodes, visible.edges]);

  // ── interação: coordenadas de tela → mundo ────────────────────────────────
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const sx = ((clientX - rect.left) / rect.width) * (WIDTH / view.k) + view.x;
      const sy = ((clientY - rect.top) / rect.height) * (HEIGHT / view.k) + view.y;
      return { x: sx, y: sy };
    },
    [view]
  );

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = id;
    alphaRef.current = Math.max(alphaRef.current, 0.4);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      const p = posRef.current.get(draggingRef.current);
      if (p) {
        p.x = w.x;
        p.y = w.y;
        p.vx = 0;
        p.vy = 0;
      }
      forceTick((t) => t + 1);
    } else if (panRef.current) {
      const dx = (e.clientX - panRef.current.x) * (WIDTH / view.k / (svgRef.current?.getBoundingClientRect().width ?? WIDTH));
      const dy = (e.clientY - panRef.current.y) * (HEIGHT / view.k / (svgRef.current?.getBoundingClientRect().height ?? HEIGHT));
      setView((v) => ({ ...v, x: panRef.current!.vx - dx, y: panRef.current!.vy - dy }));
    }
  };

  const onPointerUp = () => {
    draggingRef.current = null;
    panRef.current = null;
  };

  const onBgPointerDown = (e: React.PointerEvent) => {
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setView((v) => ({ ...v, k: Math.min(3, Math.max(0.3, v.k * factor)) }));
  };

  const toggleType = (t: MindNodeType) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const resetView = () => {
    setView({ x: 0, y: 0, k: 0.85 });
    alphaRef.current = 1;
  };

  // tipos presentes no grafo (para a legenda/filtros)
  const presentTypes = useMemo(() => {
    const s = new Set<MindNodeType>();
    graph?.nodes.forEach((n) => s.add(n.type));
    return (Object.keys(MIND_TYPE_META) as MindNodeType[]).filter((t) => s.has(t));
  }, [graph]);

  // nós/arestas em destaque ao passar o mouse
  const neighbors = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    visible.edges.forEach((e) => {
      if (e.source === hover) set.add(e.target);
      if (e.target === hover) set.add(e.source);
    });
    return set;
  }, [hover, visible.edges]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Mapa mental</h1>
            <p className="text-xs text-muted-foreground">
              Teia de conhecimento — como os módulos se conectam pelos seus vínculos
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={resetView}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Recentralizar
        </Button>
      </div>

      {/* filtros / legenda por módulo */}
      {presentTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
          {presentTypes.map((t) => {
            const meta = MIND_TYPE_META[t];
            const off = hidden.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  off ? "opacity-40" : "hover:bg-accent"
                )}
                title={off ? `Mostrar ${meta.label}` : `Ocultar ${meta.label}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-muted/20">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && visible.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Network className="h-8 w-8 opacity-40" />
            <p className="max-w-sm text-sm">
              Nenhum vínculo entre módulos ainda. Conecte um aluno a um contato, uma festa a uma
              GIG, um conteúdo a uma faixa — e a teia aparece aqui.
            </p>
          </div>
        )}

        {!loading && !error && visible.nodes.length > 0 && (
          <svg
            ref={svgRef}
            className="h-full w-full touch-none select-none"
            viewBox={`${view.x} ${view.y} ${WIDTH / view.k} ${HEIGHT / view.k}`}
            onPointerDown={onBgPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            {/* arestas */}
            {visible.edges.map((e, i) => {
              const a = posRef.current.get(e.source);
              const b = posRef.current.get(e.target);
              if (!a || !b) return null;
              const active = !neighbors || (neighbors.has(e.source) && neighbors.has(e.target));
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  className={cn("text-border", active ? "opacity-70" : "opacity-15")}
                  strokeWidth={1.5}
                />
              );
            })}
            {/* nós */}
            {visible.nodes.map((n) => {
              const p = posRef.current.get(n.id);
              if (!p) return null;
              const meta = MIND_TYPE_META[n.type];
              const deg = degree.get(n.id) ?? 1;
              const r = Math.min(26, 8 + deg * 2.5);
              const dim = neighbors ? !neighbors.has(n.id) : false;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  className={cn("cursor-pointer transition-opacity", dim && "opacity-25")}
                  onPointerDown={(e) => onNodePointerDown(e, n.id)}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (draggingRef.current) return;
                    navigate(n.route);
                  }}
                >
                  <circle
                    r={r}
                    fill={meta.color}
                    stroke="white"
                    strokeWidth={1.5}
                    className="drop-shadow"
                  />
                  <text
                    y={r + 13}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground text-[11px] font-medium"
                  >
                    {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* dica de uso */}
        {!loading && visible.nodes.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-background/80 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
            Arraste nós · role para zoom · clique para abrir o módulo
          </div>
        )}
      </div>
    </div>
  );
}
