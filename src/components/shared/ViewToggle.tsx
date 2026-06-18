import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewOption<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
};

/** Segmented control padrão de troca de visualização (cards/lista/mapa). */
export function ViewToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ViewOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-label={opt.label}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition",
              active
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
