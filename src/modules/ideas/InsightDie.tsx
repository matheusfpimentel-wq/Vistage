import { useCallback, useEffect, useState } from "react";
import { Dices, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, toLocalISODate } from "@/lib/format";
import { listOkrs, okrProgress } from "@/modules/objetivos/api";
import { listTasks } from "@/modules/tasks/api";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { loadSwot } from "@/modules/dashboard/methodologies";
import { listIdeas } from "./api";

/**
 * "Dado de insights": junta dados espalhados pelo app (OKRs, SWOT, Eisenhower,
 * ideias quentes, próximas GIGs) e sorteia um deles para provocar conexões
 * inesperadas durante o brainstorm. Cada clique no dado sorteia outro.
 */
export function InsightDie() {
  const [pool, setPool] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const buildPool = useCallback(async () => {
    const today = toLocalISODate();
    const out: string[] = [];

    try {
      const okrs = await listOkrs();
      for (const o of okrs) {
        const pct = Math.round(okrProgress(o) * 100);
        out.push(`OKR "${o.objective}" está em ${pct}%. O que destravaria os próximos 10%?`);
      }
    } catch { /* ignore */ }

    try {
      const swot = await loadSwot();
      for (const s of swot.strengths) out.push(`Força: ${s}. Como amplificar?`);
      for (const w of swot.weaknesses) out.push(`Fraqueza: ${w}. Qual o menor passo pra corrigir?`);
      for (const o of swot.opportunities) out.push(`Oportunidade: ${o}. Vale agir agora?`);
      for (const t of swot.threats) out.push(`Ameaça: ${t}. Como mitigar?`);
    } catch { /* ignore */ }

    try {
      const tasks = await listTasks();
      const urgent = tasks.filter((t) => t.status !== "Concluída" && t.eisenhower_quadrant === "do");
      if (urgent.length > 0) {
        out.push(`Você tem ${urgent.length} tarefa(s) urgente(s) e importante(s) no Eisenhower.`);
        const sample = urgent[Math.floor(Math.random() * urgent.length)];
        out.push(`Tarefa-chave: "${sample.title}". Dá pra resolver hoje?`);
      }
    } catch { /* ignore */ }

    try {
      const hot = await listIdeas({ heat: 3 });
      for (const i of hot.slice(0, 8)) {
        out.push(`Ideia quente: "${i.title}". Que primeiro passo a tornaria real?`);
      }
    } catch { /* ignore */ }

    try {
      const gigs = await listGigs();
      const upcoming = gigs
        .filter((g) => g.date >= today && g.status !== "Cancelada")
        .sort((a, b) => a.date.localeCompare(b.date));
      if (upcoming[0]) {
        out.push(`Próxima GIG: ${gigDisplayName(upcoming[0])} em ${formatDate(upcoming[0].date)}. Algo a preparar?`);
      }
    } catch { /* ignore */ }

    if (out.length === 0) {
      out.push("Sem dados suficientes ainda — registre OKRs, GIGs ou ideias e role o dado de novo.");
    }
    return out;
  }, []);

  const roll = useCallback((source: string[]) => {
    if (source.length === 0) return;
    setRolling(true);
    const pick = source[Math.floor(Math.random() * source.length)];
    window.setTimeout(() => {
      setCurrent(pick);
      setRolling(false);
    }, 250);
  }, []);

  useEffect(() => {
    void buildPool().then((p) => {
      setPool(p);
      roll(p);
    });
  }, [buildPool, roll]);

  async function handleRoll() {
    const fresh = await buildPool();
    setPool(fresh);
    roll(fresh);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-3 py-3">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
        <p className={`flex-1 text-sm transition-opacity ${rolling ? "opacity-30" : "opacity-100"}`}>
          {current ?? "Rolando…"}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void handleRoll()}
          disabled={rolling || pool.length === 0}
        >
          <Dices className="h-4 w-4" /> Novo insight
        </Button>
      </CardContent>
    </Card>
  );
}
