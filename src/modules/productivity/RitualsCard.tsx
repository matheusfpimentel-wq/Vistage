import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
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

/** Dias sem revisar a semana antes do botão da semana ganhar destaque. */
const WEEKLY_NUDGE_DAYS = 7;

/**
 * Surface COMPACTA dos rituais na home: uma barra fina com "Top 3 de hoje" +
 * os atalhos "Revisar semana" e "Fechar o dia". Só quando há Top 3 é que a
 * lista marcável aparece abaixo — vazio, fica só a barra (não come várias
 * linhas da home à toa). "Fechar o dia" ganha destaque à noite; "Revisar
 * semana", quando passa de 7 dias sem revisão.
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
  const doneCount = items.filter((p) => p.done).length;

  async function toggle(p: Priority) {
    await togglePriorityDone(p.id, !p.done);
    await load();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sun className="h-4 w-4 text-muted-foreground" />
          Top 3 de hoje
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {doneCount}/{items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
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
      </div>
      {items.length > 0 && (
        <ul className="space-y-1.5 border-t px-4 py-3">
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
      <ShutdownDialog open={open} onOpenChange={setOpen} onDone={() => void load()} />
      <WeeklyReviewDialog open={weekOpen} onOpenChange={setWeekOpen} onDone={() => void load()} />
    </Card>
  );
}
