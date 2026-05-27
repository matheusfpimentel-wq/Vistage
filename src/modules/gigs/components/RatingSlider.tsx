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
 * Slider 0..5 com passo 0.5 e bolinhas de estrela.
 * Mostra também um textarea opcional para o motivo da nota.
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span className="tabular-nums font-medium text-foreground">
            {value === null ? "—" : value.toFixed(1).replace(".", ",")}
          </span>
          <span>/ 5,0</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-amber-500",
          value === null && "opacity-60"
        )}
      />

      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
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
