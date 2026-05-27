import { Badge } from "@/components/ui/badge";
import { type GigStatus, statusVariant } from "../types";

export function StatusBadge({ status }: { status: GigStatus }) {
  return <Badge variant={statusVariant(status)}>{status}</Badge>;
}
