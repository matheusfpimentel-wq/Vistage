import { cn } from "@/lib/utils";

export function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-md border p-3">
      {icon && (
        <div className="mb-1 text-muted-foreground">{icon}</div>
      )}
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          trend === "up" && "text-emerald-500",
          trend === "down" && "text-red-400"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}
