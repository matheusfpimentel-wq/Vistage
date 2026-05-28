import { Badge } from "@/components/ui/badge";
import { priorityVariant, type TaskPriority } from "../types";

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge variant={priorityVariant(priority)}>{priority}</Badge>;
}
