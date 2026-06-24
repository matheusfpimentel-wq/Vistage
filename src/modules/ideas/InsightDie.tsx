import { useCallback, useEffect, useState } from "react";
import { Dices, Eye, EyeOff, Settings2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
 * poder ser ocultado/restaurado. Os que vêm dos SEUS dados (OKR, SWOT, ideia,
 * debrief de GIG…) são `deletable`: podem ser excluídos de vez. As provocações
 * perenes (built-in) só podem ser ocultadas/mostradas.
 */
type Insight = { key: string; text: string };
type RawInsight = { key: string; text: string; deletable: boolean };

// Persiste no .vistage (prefixo vistage.filter.* é hidratado ao abrir o doc).
const DISMISS_KEY = "vistage.filter.insightDie.dismissed";
const DELETED_KEY = "vistage.filter.insightDie.deleted";

function loadSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSet(storageKey: string, set: Set<string>) {
  persistDocSetting(storageKey, JSON.stringify([...set]));
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

/** Gera TODAS as provocações possíveis (sem filtrar ocultas/excluídas). */
async function generateRaw(): Promise<RawInsight[]> {
  const today = toLocalISODate();
  const out: RawInsight[] = [];
  const add = (key: string, text: string, deletable: boolean) =>
    out.push({ key, text, deletable });

  try {
    const okrs = await listOkrs();
    for (const o of okrs) {
      const pct = Math.round(okrProgress(o) * 100);
      add(`okr:${o.id}`, `OKR "${o.objective}" está em ${pct}%. O que destravaria os próximos 10%?`, true);
    }
  } catch { /* ignore */ }

  try {
    const swot = await loadSwot();
    for (const s of swot.strengths) add(`swot:s:${s}`, `Força: ${s}. Como amplificar?`, true);
    for (const w of swot.weaknesses) add(`swot:w:${w}`, `Fraqueza: ${w}. Qual o menor passo pra corrigir?`, true);
    for (const o of swot.opportunities) add(`swot:o:${o}`, `Oportunidade: ${o}. Vale agir agora?`, true);
    for (const t of swot.threats) add(`swot:t:${t}`, `Ameaça: ${t}. Como mitigar?`, true);
  } catch { /* ignore */ }

  try {
    const tasks = await listTasks();
    const urgent = tasks.filter((t) => t.status !== "Concluída" && t.eisenhower_quadrant === "do");
    if (urgent.length > 0) {
      const sample = urgent[Math.floor(Math.random() * urgent.length)];
      add(`eisenhower:${sample.id}`, `Tarefa urgente e importante: "${sample.title}". Dá pra resolver hoje?`, true);
    }
  } catch { /* ignore */ }

  try {
    const hot = await listIdeas({ heat: 3 });
    for (const i of hot.slice(0, 8)) {
      add(`idea:${i.id}`, `Ideia quente: "${i.title}". Que primeiro passo a tornaria real?`, true);
    }
  } catch { /* ignore */ }

  try {
    const gigs = await listGigs();
    const upcoming = gigs
      .filter((g) => g.date >= today && g.status !== "Cancelada")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming[0]) {
      add(`gig-next:${upcoming[0].id}`, `Próxima GIG: ${gigDisplayName(upcoming[0])} em ${formatDate(upcoming[0].date)}. Algo a preparar?`, true);
    }
    const recent = gigs
      .filter((g) => g.status === "Concluída")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
    for (const g of recent) {
      const where = gigDisplayName(g);
      for (const [idx, line] of (g.debrief_weaknesses ?? "")
        .split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
        add(`gig-weak:${g.id}:${idx}`, `Dificuldade em ${where}: ${line} — como evitar na próxima?`, true);
      }
      const learn = (g.debrief_learnings ?? "").trim();
      if (learn) add(`gig-learn:${g.id}`, `Aprendizado de ${where}: ${learn}. Como aplicar de novo?`, true);
    }
  } catch { /* ignore */ }

  // provocações perenes (built-in) — não deletáveis, só ocultáveis
  EVERGREEN.forEach((text, i) => add(`evergreen:${i}`, text, false));

  return out;
}

export function InsightDie() {
  const [pool, setPool] = useState<Insight[]>([]);
  const [current, setCurrent] = useState<Insight | null>(null);
  const [rolling, setRolling] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const buildPool = useCallback(async () => {
    const raw = await generateRaw();
    const dismissed = loadSet(DISMISS_KEY);
    const deleted = loadSet(DELETED_KEY);
    const out: Insight[] = raw
      .filter((r) => !dismissed.has(r.key) && !deleted.has(r.key))
      .map((r) => ({ key: r.key, text: r.text }));
    if (out.length === 0) {
      out.push({ key: "empty", text: "Sem provocações visíveis — role mais tarde ou reexiba em Gerenciar." });
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
    const next = loadSet(DISMISS_KEY);
    next.add(current.key);
    saveSet(DISMISS_KEY, next);
    const remaining = pool.filter((i) => i.key !== current.key);
    setPool(remaining);
    roll(remaining.length > 0 ? remaining : [{ key: "empty", text: "Tudo oculto por aqui — role de novo mais tarde." }]);
  }

  return (
    <>
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
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => setManageOpen(true)}
            title="Gerenciar provocações"
            aria-label="Gerenciar provocações"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
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

      <ManageInsightsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={() => void handleRoll()}
      />
    </>
  );
}

function ManageInsightsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [raw, setRaw] = useState<RawInsight[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    void generateRaw().then(setRaw);
    setDismissed(loadSet(DISMISS_KEY));
    setDeleted(loadSet(DELETED_KEY));
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  function toggleHide(key: string) {
    const next = new Set(dismissed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    saveSet(DISMISS_KEY, next);
    setDismissed(next);
    onChanged();
  }

  function remove(key: string) {
    const next = new Set(deleted);
    next.add(key);
    saveSet(DELETED_KEY, next);
    setDeleted(next);
    onChanged();
  }

  const visible = raw.filter((r) => !deleted.has(r.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar provocações</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Oculte ou mostre cada provocação. As que vêm dos seus dados (OKR, SWOT,
          ideia, debrief de GIG…) também podem ser excluídas de vez.
        </p>
        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </p>
          ) : (
            visible.map((r) => {
              const hidden = dismissed.has(r.key);
              return (
                <div
                  key={r.key}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-md border p-2",
                    hidden && "opacity-60"
                  )}
                >
                  <p className={cn("min-w-0 flex-1 text-sm leading-snug", hidden && "line-through")}>
                    {r.text}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => toggleHide(r.key)}
                      title={hidden ? "Mostrar" : "Ocultar"}
                      aria-label={hidden ? "Mostrar" : "Ocultar"}
                    >
                      {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                    {r.deletable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => remove(r.key)}
                        title="Excluir de vez"
                        aria-label="Excluir de vez"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
