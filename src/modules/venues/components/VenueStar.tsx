import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VenueStarStatus } from "../types";

/** Próximo estado no ciclo: none → alvo → já toquei → favorito → none. */
export function nextStarStatus(s: VenueStarStatus | null): VenueStarStatus | null {
  if (s === null) return "target";
  if (s === "target") return "played";
  if (s === "played") return "favorite";
  return null;
}

/** Peso para ordenação: alvo primeiro, depois favorito, já toquei, e sem estrela por último. */
export function starSortWeight(s: VenueStarStatus | null): number {
  switch (s) {
    case "target":
      return 0;
    case "favorite":
      return 1;
    case "played":
      return 2;
    default:
      return 3;
  }
}

export const STAR_LABEL: Record<VenueStarStatus, string> = {
  target: "Alvo — quero tocar aqui",
  played: "Já toquei aqui",
  favorite: "Já toquei e gostei",
};

const STAR_CLASS: Record<VenueStarStatus, string> = {
  target: "fill-red-500 text-red-500",
  played: "fill-amber-400 text-amber-400",
  favorite: "fill-orange-500 text-orange-500",
};

type Props = {
  status: VenueStarStatus | null;
  onCycle?: () => void;
  className?: string;
  size?: number;
};

/** Estrela clicável que cicla pelos estados do venue. */
export function VenueStar({ status, onCycle, className, size = 16 }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCycle?.();
      }}
      aria-label={status ? STAR_LABEL[status] : "Marcar venue"}
      title={status ? STAR_LABEL[status] : "Marcar como alvo"}
      className={cn(
        "inline-flex items-center justify-center rounded transition hover:scale-110",
        className
      )}
    >
      <Star
        style={{ width: size, height: size }}
        className={cn(
          status ? STAR_CLASS[status] : "text-muted-foreground/40"
        )}
      />
    </button>
  );
}
