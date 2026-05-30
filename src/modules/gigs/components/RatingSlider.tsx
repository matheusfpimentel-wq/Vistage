import { Star } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number | null;
  note: string | null;
  onChange: (value: number | null) => void;
  onNoteChange: (note: string | null) => void;
  required?: boolean;
};

/**
 * Avaliação por estrelas clicáveis (1..5).
 * Clicar na nota atual desmarca (volta a null).
 */
export function RatingSlider({
  label,
  value,
  note,
  onChange,
  onNoteChange,
  required,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <Label>
          {label}{" "}
          {required && <span className="text-destructive">*</span>}
        </Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {value === null ? "sem nota" : `${value} / 5`}
        </span>
      </div>

      <div className="flex items-center gap-1" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== null && n <= value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(value === n ? null : n)}
              className="rounded p-1 transition hover:scale-110"
              aria-label={`${n} estrelas`}
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  filled
                    ? "fill-amber-500 text-amber-500"
                    : "text-muted-foreground"
                )}
              />
            </button>
          );
        })}
      </div>

      <Textarea
        placeholder="(opcional) por que essa nota?"
        value={note ?? ""}
        onChange={(e) => onNoteChange(e.target.value || null)}
        className="mt-1 min-h-[60px]"
      />
    </div>
  );
}
