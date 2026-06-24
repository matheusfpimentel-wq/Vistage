import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PREP_GROUPS, prepProgressByGroup, type PrepItem } from "../prep";

type Props = {
  state: Record<string, 1>;
  onChange: (state: Record<string, 1>) => void;
  /** Se definido, mostra apenas os grupos cujo id está na lista. */
  groupFilter?: string[];
};

export function PrepChecklist({ state, onChange, groupFilter }: Props) {
  function toggle(item: PrepItem) {
    const next = { ...state };
    if (next[item.id]) delete next[item.id];
    else next[item.id] = 1;
    onChange(next);
  }

  const byGroup = prepProgressByGroup(state).filter(
    ({ group }) => !groupFilter || groupFilter.includes(group.id)
  );

  return (
    <div className="space-y-4">
      {byGroup.map(({ group, progress }) => (
        <div key={group.id} className="rounded-md border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </div>
            <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span>
                {progress.done}/{progress.total}
              </span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary-gradient transition-all"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1 p-2">
            {group.items.map((item) => {
              const checked = state[item.id] === 1;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60",
                    checked && "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
                        : "border-input"
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn(checked && "line-through")}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Mini indicador agrupado para o card de "Próximas GIGs" no Dashboard.
 * Mostra três barrinhas (uma por subgrupo) + total.
 */
export function PrepProgressMini({ state, groupFilter }: { state: Record<string, 1>; groupFilter?: string[] }) {
  const byGroup = prepProgressByGroup(state);
  const visibleGroups = PREP_GROUPS.filter((g) => !groupFilter || groupFilter.includes(g.id));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {visibleGroups.map((g) => {
          const idx = PREP_GROUPS.indexOf(g);
          const progress = byGroup[idx].progress;
          const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
          return (
            <div
              key={g.id}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              title={`${g.title}: ${progress.done}/${progress.total}`}
            >
              <div
                className="h-full bg-primary-gradient transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        {visibleGroups.map((g) => (
          <span key={g.id}>{g.title.split(" ")[0]}</span>
        ))}
      </div>
    </div>
  );
}
