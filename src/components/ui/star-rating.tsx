import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Nota atual (0.5 em 0.5, de 0.5 a 5) ou null quando sem nota. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Clicar na mesma nota volta a null. Padrão: true. */
  allowClear?: boolean;
  /** Tamanho das estrelas (classes tailwind). Padrão: h-7 w-7. */
  size?: string;
  className?: string;
};

/**
 * Avaliação por estrelas clicáveis com suporte a meia-estrela.
 * Metade esquerda da estrela = n − 0.5; metade direita = n.
 */
export function StarRating({
  value,
  onChange,
  allowClear = true,
  size = "h-7 w-7",
  className,
}: Props) {
  return (
    <div className={cn("flex items-center gap-1", className)} role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const full = value !== null && value >= n;
        const half = value !== null && !full && value >= n - 0.5;
        return (
          <div
            key={n}
            className="relative inline-flex transition hover:scale-110"
          >
            <Star
              className={cn(
                size,
                "transition-colors",
                full
                  ? "fill-amber-500 text-amber-500"
                  : "text-muted-foreground"
              )}
            />
            {half && (
              <span
                className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: "50%" }}
              >
                <Star className={cn(size, "fill-amber-500 text-amber-500")} />
              </span>
            )}
            <button
              type="button"
              className="absolute inset-y-0 left-0 w-1/2"
              aria-label={`${n - 0.5} estrelas`}
              onClick={() =>
                onChange(allowClear && value === n - 0.5 ? null : n - 0.5)
              }
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-1/2"
              aria-label={`${n} estrelas`}
              onClick={() => onChange(allowClear && value === n ? null : n)}
            />
          </div>
        );
      })}
    </div>
  );
}
