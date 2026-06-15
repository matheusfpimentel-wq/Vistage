import { Badge } from "@/components/ui/badge";
import { statusVariant, type TaskStatus } from "../types";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={statusVariant(status)}>{status}</Badge>;
}
