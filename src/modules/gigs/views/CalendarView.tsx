import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import { type Gig } from "../types";
import { gigDisplayName } from "../displayName";
import { cn } from "@/lib/utils";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
};

export function CalendarView({ gigs, onEdit }: Props) {
  const [cursor, setCursor] = useState(() => new Date());

  const { weeks, monthLabel } = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const weeksArr: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeksArr.push(days.slice(i, i + 7));
    }
    return {
      weeks: weeksArr,
      monthLabel: format(cursor, "LLLL yyyy", { locale: ptBR }),
    };
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Gig[]>();
    for (const g of gigs) {
      const key = g.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return map;
  }, [gigs]);

  const weekdayLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium capitalize">{monthLabel}</div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(subMonths(cursor, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-sm">
        {weekdayLabels.map((w) => (
          <div
            key={w}
            className="bg-muted/50 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground"
          >
            {w}
          </div>
        ))}

        {weeks.flat().map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayGigs = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, cursor);
          const today = isSameDay(day, new Date());
          return (
            <div
              key={key}
              className={cn(
                "min-h-[100px] bg-background p-1.5",
                !inMonth && "opacity-40"
              )}
            >
              <div
                className={cn(
                  "mb-1 text-xs tabular-nums",
                  today
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayGigs.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => onEdit(g)}
                    className="w-full truncate rounded bg-muted px-1.5 py-1 text-left text-xs transition hover:bg-accent"
                    title={`${gigDisplayName(g)} · ${g.venue_name} · ${g.status}`}
                  >
                    <div className="flex items-center gap-1">
                      <StatusBadge status={g.status} />
                    </div>
                    <div className="mt-0.5 truncate font-medium">
                      {gigDisplayName(g)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
