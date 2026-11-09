import { cn } from "@/lib/utils";
import type { VenuePriority } from "../types";

/** Peso para ordenação: Alta primeiro, depois Média, Baixa, e sem prioridade por último. */
export function prioritySortWeight(p: VenuePriority | null): number {
  switch (p) {
    case "Alta": return 0;
    case "Média": return 1;
    case "Baixa": return 2;
    default: return 3;
  }
}

const PRIORITY_VARIANT: Record<VenuePriority, { label: string; cls: string; dotCls: string }> = {
  Alta:  { label: "Alta",  cls: "border-bad/60 bg-bad/10 text-bad",    dotCls: "bg-bad" },
  Média: { label: "Média", cls: "border-warn/60 bg-warn/10 text-warn", dotCls: "bg-warn" },
  Baixa: { label: "Baixa", cls: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",       dotCls: "bg-muted-foreground/60" },
};

type Props = {
  priority: VenuePriority | null;
  className?: string;
};

export function VenuePriorityBadge({ priority, className }: Props) {
  if (!priority) return null;
  const v = PRIORITY_VARIANT[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium",
        v.cls,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", v.dotCls)} />
      {v.label}
    </span>
  );
}

type SelectorProps = {
  value: VenuePriority | null;
  onChange: (v: VenuePriority | null) => void;
};

export function VenuePrioritySelector({ value, onChange }: SelectorProps) {
  const options: Array<{ val: VenuePriority | null; label: string; cls: string }> = [
    { val: null,    label: "Nenhuma", cls: "text-muted-foreground/60 border-input" },
    { val: "Alta",  label: "Alta",    cls: "border-bad/60 text-bad" },
    { val: "Média", label: "Média",   cls: "border-warn/60 text-warn" },
    { val: "Baixa", label: "Baixa",   cls: "border-muted-foreground/40 text-muted-foreground" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.val;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.val)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition",
              opt.cls,
              active ? "bg-accent font-semibold" : "bg-background hover:bg-accent"
            )}
          >
            {opt.val && (
              <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_VARIANT[opt.val].dotCls)} />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
