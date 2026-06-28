import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, Play, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { EmptyState } from "@/components/shared/EmptyState";
import { DATA_CHANGED } from "@/lib/events";
import {
  createFanTask,
  deleteFanSegment,
  listFanSegments,
  listFans,
  loadFanClubConfig,
  parseFanSegmentCriterios,
  type FanFilters,
} from "../api";
import type { FanClubAction, FanSegment } from "../types";

/** Descrição curta e legível dos critérios de um segmento. */
function describeCriterios(c: FanFilters): string {
  const parts: string[] = [];
  if (c.level && c.level !== "Todos") parts.push(c.level);
  if (c.city) parts.push(`em ${c.city}`);
  if (c.origem) parts.push(`origem ${c.origem}`);
  if (c.minDays) parts.push(`sem contato há +${c.minDays}d`);
  if (c.hasPerk === true) parts.push("com perk");
  else if (c.hasPerk === false) parts.push("sem perk");
  if (c.ambassador) parts.push("embaixadores");
  if (c.groupId) parts.push("de um grupo");
  if (c.attendedGigId) parts.push("foram a uma GIG");
  if (c.search) parts.push(`"${c.search}"`);
  return parts.length ? parts.join(" · ") : "todos os fãs";
}

/**
 * Segmentos salvos = filtros reutilizáveis (§6). Cada um pode ser aplicado de
 * volta ao roster (onApply) ou usado pra uma AÇÃO EM LOTE: cria a mesma tarefa
 * rápida pra todos os fãs que batem com o filtro agora.
 */
export function FanSegmentsPanel({ onApply }: { onApply: (c: FanFilters) => void }) {
  const [segments, setSegments] = useState<FanSegment[]>([]);
  const [actions, setActions] = useState<FanClubAction[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setSegments(await listFanSegments());
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    void loadFanClubConfig().then((c) => setActions(c.actions)).catch(() => {});
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(DATA_CHANGED, onChange);
    };
  }, [refresh]);

  async function handleDelete(seg: FanSegment) {
    const ok = await confirmDialog({
      title: "Excluir segmento",
      description: `Excluir o segmento "${seg.nome}"? (Os fãs não são afetados.)`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteFanSegment(seg.id);
    await refresh();
  }

  async function applyAction(seg: FanSegment, action: FanClubAction) {
    const criterios = parseFanSegmentCriterios(seg.criterios);
    const fans = await listFans(criterios);
    if (fans.length === 0) {
      toast.info("Nenhum fã neste segmento agora.");
      return;
    }
    const ok = await confirmDialog({
      title: "Ação em lote",
      description: `Criar a tarefa "${action.label}" para ${fans.length} fã(s) do segmento "${seg.nome}"?`,
      confirmLabel: `Criar ${fans.length} tarefa(s)`,
    });
    if (!ok) return;
    setBusyId(seg.id);
    // Sequencial com try/catch por fã: uma falha no meio não derruba o resto;
    // ao fim, reporta quantas saíram e quantas falharam.
    let okCount = 0;
    let failCount = 0;
    for (const f of fans) {
      try {
        await createFanTask(f.id, action.titleTemplate.replace(/\{nome\}/g, f.name));
        okCount++;
      } catch {
        failCount++;
      }
    }
    if (mountedRef.current) setBusyId(null);
    if (failCount === 0) toast.success(`${okCount} tarefa(s) criada(s) para "${seg.nome}"`);
    else toast.error(`${okCount} criada(s), ${failCount} falharam`);
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Segmentos salvos</h3>
      {segments.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum segmento salvo."
          description="Filtre os fãs na aba Fãs e clique em “Salvar segmento” pra reutilizar o filtro e agir em lote."
        />
      ) : (
        <div className="space-y-2">
          {segments.map((seg) => {
            const c = parseFanSegmentCriterios(seg.criterios);
            return (
              <div key={seg.id} className="rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{seg.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{describeCriterios(c)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onApply(c)}>
                    <Play className="h-3.5 w-3.5" /> Aplicar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => void handleDelete(seg)}
                    aria-label="Excluir segmento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Megaphone className="h-3 w-3" /> Ação em lote:
                    </span>
                    {actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={busyId === seg.id}
                        className="rounded-full border bg-background px-2.5 py-1 text-xs transition hover:border-primary disabled:opacity-50"
                        onClick={() => void applyAction(seg, a)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
