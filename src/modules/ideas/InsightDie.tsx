import { useCallback, useEffect, useState } from "react";
import { Dices, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DELETED_KEY, DISMISS_KEY, generateRaw, loadSet, saveSet } from "./provocations";

/**
 * "Dado de insights": sorteia uma provocação pra estimular conexões no
 * brainstorm. A GESTÃO das provocações (ocultar/mostrar/excluir) fica em
 * Configurações → Insights. Aqui dá pra ocultar a atual rapidinho (👁).
 */
type Insight = { key: string; text: string };

export function InsightDie() {
  const [pool, setPool] = useState<Insight[]>([]);
  const [current, setCurrent] = useState<Insight | null>(null);
  const [rolling, setRolling] = useState(false);

  const buildPool = useCallback(async () => {
    const raw = await generateRaw();
    const dismissed = loadSet(DISMISS_KEY);
    const deleted = loadSet(DELETED_KEY);
    const out: Insight[] = raw
      .filter((r) => !dismissed.has(r.key) && !deleted.has(r.key))
      .map((r) => ({ key: r.key, text: r.text }));
    if (out.length === 0) {
      out.push({ key: "empty", text: "Sem provocações visíveis — role mais tarde ou reexiba em Configurações → Insights." });
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
