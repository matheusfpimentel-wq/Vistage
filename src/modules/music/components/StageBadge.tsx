import { cn } from "@/lib/utils";
import { STAGE_COLOR, type Stage } from "../stages";

export function StageBadge({
  stage,
  standby,
  className,
}: {
  stage: Stage;
  standby?: boolean;
  className?: string;
}) {
  if (standby) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
          "bg-muted text-muted-foreground",
          className
        )}
      >
        Stand-by
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STAGE_COLOR[stage],
        className
      )}
    >
      {stage}
    </span>
  );
}
