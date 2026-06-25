import { Rows2, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModuleView } from "@/lib/moduleView";

export type ListDensity = "full" | "compact";

/**
 * Densidade da lista por módulo — "completa" (rica, com detalhes) ou "compacta"
 * (uma linha por item, pra varrer rápido). É preferência da MÁQUINA, persistida
 * por módulo no localStorage (mesmo mecanismo do useModuleView). O default é
 * "completa".
 */
export function useListDensity(
  moduleKey: string,
  initial: ListDensity = "full"
): [ListDensity, (v: ListDensity) => void] {
  return useModuleView<ListDensity>(`${moduleKey}.density`, initial);
}

/**
 * Dois ícones lado a lado pra alternar entre lista completa e compacta. Fica à
 * direita da barra de views; aparece só quando a view "lista" está selecionada.
 */
export function ListDensityToggle({
  value,
  onChange,
  className,
}: {
  value: ListDensity;
  onChange: (v: ListDensity) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5",
        className
      )}
      role="group"
      aria-label="Densidade da lista"
    >
      <button
        type="button"
        onClick={() => onChange("full")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded transition-colors",
          value === "full"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        title="Lista completa"
        aria-label="Lista completa"
        aria-pressed={value === "full"}
      >
        <Rows2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("compact")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded transition-colors",
          value === "compact"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        title="Lista compacta"
        aria-label="Lista compacta"
        aria-pressed={value === "compact"}
      >
        <Rows4 className="h-4 w-4" />
      </button>
    </div>
  );
}
