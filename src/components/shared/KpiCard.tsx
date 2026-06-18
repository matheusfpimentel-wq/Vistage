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
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-2xl font-semibold tabular-nums",
          trend === "up"
            ? "text-emerald-500"
            : trend === "down"
              ? "text-red-400"
              : "text-primary"
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
