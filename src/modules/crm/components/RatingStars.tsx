import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
};

/** 5 estrelas clicáveis (1..5). Clicar na nota atual desmarca (volta a null). */
export function RatingStars({ value, onChange, size = "md", readOnly }: Props) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  return (
    <div className="inline-flex items-center gap-0.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== null && n <= value;
        const Inner = (
          <Star
            className={cn(
              dim,
              filled ? "fill-amber-500 text-amber-500" : "text-muted-foreground"
            )}
          />
        );
        if (readOnly) {
          return (
            <span key={n} aria-label={`${n} estrelas`}>
              {Inner}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(value === n ? null : n)}
            className="rounded p-0.5 transition hover:scale-110"
            aria-label={`${n} estrelas`}
          >
            {Inner}
          </button>
        );
      })}
    </div>
  );
}
