import { List, ListChecks, Table } from "lucide-react";
import { cn } from "@/lib/utils";

export type GigListFormat = "normal" | "bulk" | "sheet";

const OPTIONS: { value: GigListFormat; label: string; icon: typeof List }[] = [
  { value: "normal", label: "Lista", icon: List },
  { value: "bulk", label: "Seleção múltipla", icon: ListChecks },
  { value: "sheet", label: "Planilha", icon: Table },
];

/**
 * Seletor de formato da Lista de GIGs: lista normal, seleção múltipla ou
 * planilha. Antes eram abas separadas; viraram alternativas dentro de "Lista".
 */
export function GigListFormatToggle({
  value,
  onChange,
}: {
  value: GigListFormat;
  onChange: (v: GigListFormat) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5"
      role="group"
      aria-label="Formato da lista"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={o.label}
            aria-label={o.label}
            aria-pressed={active}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
