import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { ShutdownDialog } from "./ShutdownDialog";
import { WeeklyReviewDialog } from "./WeeklyReviewDialog";
import {
  daysSinceISO,
  getPriorities,
  lastShutdownDate,
  lastWeeklyReviewDate,
  todayISO,
  togglePriorityDone,
  type Priority,
} from "./api";

/** Dias sem revisar a semana antes do empurrãozinho aparecer. */
const WEEKLY_NUDGE_DAYS = 7;

/**
 * Card do Ritual de encerramento na home: mostra o "Top 3 de hoje" (montado na
 * noite anterior, marcável), o botão "Fechar o dia" e o atalho "Revisar semana".
 * À noite, se o dia ainda não foi fechado, um empurrãozinho discreto aparece; se
 * a revisão semanal está atrasada (>7 dias), o botão da semana ganha destaque.
 */
export function RitualsCard() {
  const [items, setItems] = useState<Priority[]>([]);
  const [lastClose, setLastClose] = useState<string | null>(null);
  const [lastWeekly, setLastWeekly] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);

  const load = useCallback(async () => {
    const [top3, last, lastWk] = await Promise.all([
      getPriorities("day", todayISO()),
      lastShutdownDate(),
      lastWeeklyReviewDate(),
    ]);
    setItems(top3);
    setLastClose(last);
    setLastWeekly(lastWk);
  }, []);

  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener(DATA_CHANGED, h);
    return () => window.removeEventListener(DATA_CHANGED, h);
  }, [load]);

  const notClosedToday = lastClose !== todayISO();
  const eveningNudge = notClosedToday && new Date().getHours() >= 17;
  const weekDue = daysSinceISO(lastWeekly) >= WEEKLY_NUDGE_DAYS;

  async function toggle(p: Priority) {
    await togglePriorityDone(p.id, !p.done);
    await load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sun className="h-4 w-4" /> Top 3 de hoje
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={weekDue ? "default" : "outline"}
            onClick={() => setWeekOpen(true)}
          >
            <CalendarCheck className="h-4 w-4" /> Revisar semana
          </Button>
          <Button
            size="sm"
            variant={eveningNudge ? "default" : "outline"}
            onClick={() => setOpen(true)}
          >
            <Moon className="h-4 w-4" /> Fechar o dia
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {notClosedToday
              ? "Feche o dia à noite pra amanhã já começar com seu Top 3 pronto."
              : "Sem Top 3 definido pra hoje."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary"
                  checked={p.done}
                  onChange={() => void toggle(p)}
                />
                <span className={cn("text-sm", p.done && "text-muted-foreground line-through")}>
                  {p.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        {eveningNudge && items.length > 0 && (
          <p className="mt-2 text-xs text-amber-500">Você ainda não fechou o dia de hoje.</p>
        )}
        {weekDue && (
          <p className="mt-2 text-xs text-sky-500">
            {lastWeekly
              ? "Faz mais de uma semana desde a última revisão."
              : "Que tal fazer sua primeira revisão semanal?"}
          </p>
        )}
      </CardContent>
      <ShutdownDialog open={open} onOpenChange={setOpen} onDone={() => void load()} />
      <WeeklyReviewDialog open={weekOpen} onOpenChange={setWeekOpen} onDone={() => void load()} />
    </Card>
  );
}
