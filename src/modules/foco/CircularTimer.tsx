import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Tempo decorrido já formatado (mm:ss ou h:mm:ss). */
  elapsedLabel: string;
  /** Progresso 0..1 rumo ao tempo previsto. undefined = sem previsão (sem anel). */
  progress?: number;
  /** Rótulo do tempo previsto (ex.: "45min") ou null. */
  plannedLabel?: string | null;
  paused: boolean;
  /** O tempo previsto já venceu — o anel vira alerta (âmbar + pulso). */
  expired?: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
};

/**
 * Círculo do modo foco: anel de progresso rumo ao tempo previsto, com o tempo
 * decorrido no centro e o play/pause embaixo. Clicar no círculo pausa/retoma.
 * Reutilizável (mini-janela de foco e, futuramente, a página).
 */
export function CircularTimer({
  elapsedLabel,
  progress,
  plannedLabel,
  paused,
  expired,
  onToggle,
  size = 180,
  className,
}: Props) {
  const stroke = Math.max(6, Math.round(size * 0.05));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = progress == null ? 0 : Math.min(1, Math.max(0, progress));
  const dash = circ * clamped;
  const ringColor = expired ? "hsl(38 92% 56%)" : "hsl(var(--primary))";

  return (
    <button
      type="button"
      onClick={onToggle}
      title={paused ? "Retomar" : "Pausar"}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="block -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          opacity={0.35}
        />
        {progress != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            className={cn("transition-[stroke-dasharray] duration-700 ease-linear", expired && "animate-pulse")}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className={cn("font-mono font-semibold tabular-nums leading-none", expired && "text-amber-500")}
          style={{ fontSize: size * 0.2 }}
        >
          {elapsedLabel}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {plannedLabel ? `/ ${plannedLabel}` : paused ? "pausado" : "foco"}
        </span>
      </span>
    </button>
  );
}
