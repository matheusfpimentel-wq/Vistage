import { useCallback, useEffect, useState } from "react";
import { Dices, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, toLocalISODate } from "@/lib/format";
import { persistDocSetting } from "@/lib/docSettings";
import { listOkrs, okrProgress } from "@/modules/objetivos/api";
import { listTasks } from "@/modules/tasks/api";
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { loadSwot } from "@/modules/dashboard/methodologies";
import { listIdeas } from "./api";

/**
 * "Dado de insights": junta dados espalhados pelo app e sorteia um deles para
 * provocar conexões durante o brainstorm. Cada item tem uma `key` estável pra
 * poder ser ocultado ("não aparecer mais"). As dificuldades das GIGs entram
 * aqui como insight (não viram ideia) — pra refletir sem poluir o módulo Ideias.
 */
type Insight = { key: string; text: string };

// Persiste no .vistage (prefixo vistage.filter.* é hidratado ao abrir o doc).
const DISMISS_KEY = "vistage.filter.insightDie.dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

// Provocações perenes — garantem variedade mesmo com pouco dado cadastrado.
const EVERGREEN: string[] = [
  "Se você só pudesse tocar em 1 lugar neste mês, qual seria — e por quê?",
  "Qual som/transição te marcou na última GIG? Dá pra virar marca registrada?",
  "Que colaboração (DJ, produtor, marca) abriria mais portas agora?",
  "O que no seu set ninguém mais faz? Como deixar isso mais óbvio pro público?",
  "Qual conteúdo de 15s sairia da sua próxima GIG quase pronto?",
  "Que tarefa você vem adiando há semanas? Qual o menor passo possível hoje?",
  "Se dobrasse seu cachê médio, o que precisaria ser verdade antes?",
  "Qual cidade/casa você ainda não tocou e faz sentido mirar?",
];

export function InsightDie() {
  const [pool, setPool] = useState<Insight[]>([]);
  const [current, setCurrent] = useState<Insight | null>(null);
  const [rolling, setRolling] = useState(false);

  const buildPool = useCallback(async () => {
    const today = toLocalISODate();
    const dismissed = loadDismissed();
    const out: Insight[] = [];
    const add = (key: string, text: string) => {
      if (!dismissed.has(key)) out.push({ key, text });
    };

    try {
      const okrs = await listOkrs();
      for (const o of okrs) {
        const pct = Math.round(okrProgress(o) * 100);
        add(`okr:${o.id}`, `OKR "${o.objective}" está em ${pct}%. O que destravaria os próximos 10%?`);
      }
    } catch { /* ignore */ }

    try {
      const swot = await loadSwot();
      for (const s of swot.strengths) add(`swot:s:${s}`, `Força: ${s}. Como amplificar?`);
      for (const w of swot.weaknesses) add(`swot:w:${w}`, `Fraqueza: ${w}. Qual o menor passo pra corrigir?`);
      for (const o of swot.opportunities) add(`swot:o:${o}`, `Oportunidade: ${o}. Vale agir agora?`);
      for (const t of swot.threats) add(`swot:t:${t}`, `Ameaça: ${t}. Como mitigar?`);
    } catch { /* ignore */ }

    try {
      const tasks = await listTasks();
      const urgent = tasks.filter((t) => t.status !== "Concluída" && t.eisenhower_quadrant === "do");
      if (urgent.length > 0) {
        const sample = urgent[Math.floor(Math.random() * urgent.length)];
        add(`eisenhower:${sample.id}`, `Tarefa urgente e importante: "${sample.title}". Dá pra resolver hoje?`);
      }
    } catch { /* ignore */ }

    try {
      const hot = await listIdeas({ heat: 3 });
      for (const i of hot.slice(0, 8)) {
        add(`idea:${i.id}`, `Ideia quente: "${i.title}". Que primeiro passo a tornaria real?`);
      }
    } catch { /* ignore */ }

    try {
      const gigs = await listGigs();
      // próxima GIG
      const upcoming = gigs
        .filter((g) => g.date >= today && g.status !== "Cancelada")
        .sort((a, b) => a.date.localeCompare(b.date));
      if (upcoming[0]) {
        add(`gig-next:${upcoming[0].id}`, `Próxima GIG: ${gigDisplayName(upcoming[0])} em ${formatDate(upcoming[0].date)}. Algo a preparar?`);
      }
      // dificuldades e aprendizados das GIGs concluídas recentes — viram INSIGHT,
      // não ideia. (Pega as 12 mais recentes pra não inundar.)
      const recent = gigs
        .filter((g) => g.status === "Concluída")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12);
      for (const g of recent) {
        const where = gigDisplayName(g);
        for (const [idx, line] of (g.debrief_weaknesses ?? "")
          .split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
          add(`gig-weak:${g.id}:${idx}`, `Dificuldade em ${where}: ${line} — como evitar na próxima?`);
        }
        const learn = (g.debrief_learnings ?? "").trim();
        if (learn) add(`gig-learn:${g.id}`, `Aprendizado de ${where}: ${learn}. Como aplicar de novo?`);
      }
    } catch { /* ignore */ }

    // provocações perenes
    EVERGREEN.forEach((text, i) => add(`evergreen:${i}`, text));

    if (out.length === 0) {
      out.push({ key: "empty", text: "Sem dados suficientes ainda — registre OKRs, GIGs ou ideias e role o dado de novo." });
    }
    return out;
  }, []);

  const roll = useCallback((source: Insight[]) => {
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

  // "Não aparecer mais": grava a key e re-sorteia do que sobrou.
  function dismissCurrent() {
    if (!current || current.key === "empty") return;
    const next = loadDismissed();
    next.add(current.key);
    persistDocSetting(DISMISS_KEY, JSON.stringify([...next]));
    const remaining = pool.filter((i) => i.key !== current.key);
    setPool(remaining);
    roll(remaining.length > 0 ? remaining : [{ key: "empty", text: "Tudo oculto por aqui — role de novo mais tarde." }]);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-3 py-3">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
        <p className={`flex-1 text-sm transition-opacity ${rolling ? "opacity-30" : "opacity-100"}`}>
          {current?.text ?? "Rolando…"}
        </p>
        {current && current.key !== "empty" && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={dismissCurrent}
            title="Não aparecer mais"
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        )}
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
