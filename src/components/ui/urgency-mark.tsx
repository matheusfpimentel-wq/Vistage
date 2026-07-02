import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  urgencyLevel,
  urgencyTextClass,
  type UrgencyKind,
  type UrgencyLevel,
} from "@/lib/urgency";

/**
 * Marca de urgência: ícone + cor (nunca só cor — WCAG 1.4.1). `ok`/nula não
 * pinta nada; se vier `label`, ele aparece com a cor de texto padrão.
 *
 * Drop-in para exibir uma data/prazo já com o sinal de urgência:
 *   <UrgencyMark date={task.due_date} kind="deadline" label={formatDate(task.due_date)} />
 *
 * Passe `level` direto quando o gatilho já foi calculado (ex.: item resolvido →
 * o chamador passa `null` para não pintar).
 */
export function UrgencyMark({
  date,
  kind,
  level: levelProp,
  now,
  label,
  className,
}: {
  date?: string | Date | null;
  kind?: UrgencyKind;
  level?: UrgencyLevel | null;
  now?: Date;
  /** Texto ao lado do ícone (ex.: a própria data formatada). */
  label?: React.ReactNode;
  className?: string;
}) {
  const level =
    levelProp !== undefined ? levelProp : date !== undefined && kind ? urgencyLevel(date, kind, now) : null;

  if (level == null || level === "ok") {
    return label != null ? <span className={className}>{label}</span> : null;
  }

  const Icon = level === "overdue" ? AlertTriangle : Clock;
  const title = level === "overdue" ? "Vencido" : "Vence em breve";
  return (
    <span className={cn("inline-flex items-center gap-1", urgencyTextClass(level), className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-label={title} />
      {label != null && <span>{label}</span>}
    </span>
  );
}
