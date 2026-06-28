import { useCallback, useEffect, useState } from "react";
import { Clock, Dices, EyeOff, Lightbulb, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { createIdea } from "./api";
import {
  activeSnoozeKeys,
  DELETED_KEY,
  DISMISS_KEY,
  generateRaw,
  loadSet,
  PINNED_KEY,
  saveSet,
  snoozeInsight,
  type InsightKind,
} from "./provocations";

/**
 * "Dado de insights": sorteia uma provocação pra estimular conexões no
 * brainstorm. Ranqueia as DERIVADAS DO DADO (do seu material) acima das
 * genéricas; deixa fixar (📌), adiar (soneca) e — o que faltava — RESPONDER
 * VIRA IDEIA num clique. Gestão completa fica em Configurações → Insights.
 */
type Insight = { key: string; text: string; kind: InsightKind };

const EMPTY: Insight = {
  key: "empty",
  text: "Sem provocações visíveis — role mais tarde ou reexiba em Configurações → Insights.",
  kind: "generic",
};

/** Ranking: fixadas > derivadas-de-dado > genéricas. Evita repetir a atual. */
function pickRanked(pool: Insight[], avoidKey?: string): Insight | null {
  if (pool.length === 0) return null;
  const pinned = loadSet(PINNED_KEY);
  const tiers = [
    pool.filter((i) => pinned.has(i.key)),
    pool.filter((i) => !pinned.has(i.key) && i.kind === "derived"),
    pool.filter((i) => !pinned.has(i.key) && i.kind === "generic"),
  ];
  for (const tier of tiers) {
    if (tier.length === 0) continue;
    const choices = tier.length > 1 && avoidKey ? tier.filter((i) => i.key !== avoidKey) : tier;
    const from = choices.length ? choices : tier;
    return from[Math.floor(Math.random() * from.length)];
  }
  return null;
}

export function InsightDie({ onCreatedIdea }: { onCreatedIdea?: (id: number) => void } = {}) {
  const [pool, setPool] = useState<Insight[]>([]);
  const [current, setCurrent] = useState<Insight | null>(null);
  const [rolling, setRolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => loadSet(PINNED_KEY));

  const buildPool = useCallback(async () => {
    const raw = await generateRaw();
    const dismissed = loadSet(DISMISS_KEY);
    const deleted = loadSet(DELETED_KEY);
    const snoozed = activeSnoozeKeys();
    const out: Insight[] = raw
      .filter((r) => !dismissed.has(r.key) && !deleted.has(r.key) && !snoozed.has(r.key))
      .map((r) => ({ key: r.key, text: r.text, kind: r.kind }));
    return out;
  }, []);

  const roll = useCallback((source: Insight[], avoidKey?: string) => {
    if (source.length === 0) {
      setCurrent(EMPTY);
      return;
    }
    setRolling(true);
    const pick = pickRanked(source, avoidKey) ?? source[0];
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
    roll(fresh, current?.key);
  }

  // "Não aparecer mais": grava a key e re-sorteia do que sobrou.
  function dismissCurrent() {
    if (!current || current.key === "empty") return;
    const next = loadSet(DISMISS_KEY);
    next.add(current.key);
    saveSet(DISMISS_KEY, next);
    const remaining = pool.filter((i) => i.key !== current.key);
    setPool(remaining);
    roll(remaining);
  }

  // Soneca: adia por 7 dias e re-sorteia do que sobrou.
  function snoozeCurrent() {
    if (!current || current.key === "empty") return;
    snoozeInsight(current.key, 7);
    const remaining = pool.filter((i) => i.key !== current.key);
    setPool(remaining);
    roll(remaining);
    toast.success("Adiada por 7 dias");
  }

  function togglePin() {
    if (!current || current.key === "empty") return;
    const next = new Set(pinned);
    if (next.has(current.key)) next.delete(current.key);
    else next.add(current.key);
    saveSet(PINNED_KEY, next);
    setPinned(next);
  }

  // Responder vira ideia: cria uma ideia já semeada com o texto da provocação.
  async function turnIntoIdea() {
    if (!current || current.key === "empty") return;
    setBusy(true);
    try {
      const title = current.text.length > 80 ? `${current.text.slice(0, 77)}…` : current.text;
      const newId = await createIdea({
        title,
        body: current.text,
        category: null,
        tags: [],
        heat: 3,
        maturation: "Embrião",
        converted_to: null,
        converted_id: null,
        related_idea_id: null,
        source: "provocacao",
      });
      toast.success("Ideia semeada a partir da provocação");
      onCreatedIdea?.(newId);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const isReal = !!current && current.key !== "empty";
  const isPinned = !!current && pinned.has(current.key);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-2 py-3">
        <Lightbulb className="h-5 w-5 shrink-0 text-primary" />
        <p className={`flex-1 text-sm transition-opacity ${rolling ? "opacity-30" : "opacity-100"}`}>
          {current?.text ?? "Rolando…"}
          {isPinned && <span className="ml-2 text-xs font-medium text-primary">· fixada</span>}
        </p>
        {isReal && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 shrink-0", isPinned ? "text-primary" : "text-muted-foreground")}
              onClick={togglePin}
              title={isPinned ? "Soltar (não fixar mais)" : "Fixar — aparece primeiro"}
            >
              <Pin className={cn("h-4 w-4", isPinned && "fill-current")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={snoozeCurrent}
              title="Soneca — adiar por 7 dias"
            >
              <Clock className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={dismissCurrent}
              title="Não aparecer mais"
            >
              <EyeOff className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={busy}
              onClick={() => void turnIntoIdea()}
              title="Criar uma ideia já semeada com esta provocação"
            >
              <Lightbulb className="h-4 w-4" /> Virar ideia
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void handleRoll()}
          disabled={rolling}
        >
          <Dices className="h-4 w-4" /> Novo insight
        </Button>
      </CardContent>
    </Card>
  );
}
