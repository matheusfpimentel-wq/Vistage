import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/ui/star-rating";
import { InfoHint } from "@/components/ui/tooltip";

type Props = {
  label: string;
  value: number | null;
  note: string | null;
  onChange: (value: number | null) => void;
  onNoteChange: (note: string | null) => void;
  required?: boolean;
  /** Âncoras/explicação da nota, reveladas num ícone "?" ao lado do rótulo. */
  hint?: string;
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
  hint,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <Label className="flex items-center gap-1">
          {label}{" "}
          {required && <span className="text-destructive">*</span>}
          {hint && <InfoHint>{hint}</InfoHint>}
        </Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {value === null ? "sem nota" : `${value} / 5`}
        </span>
      </div>

      <StarRating value={value} onChange={onChange} />

      <Textarea
        placeholder="(opcional) por que essa nota?"
        value={note ?? ""}
        onChange={(e) => onNoteChange(e.target.value || null)}
        className="mt-1 min-h-[60px]"
      />
    </div>
  );
}
