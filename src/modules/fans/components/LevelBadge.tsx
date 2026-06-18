import { Crown, Flame, Heart, Sparkles, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { levelVariant, type FanLevel } from "../types";

const ICONS: Record<FanLevel, React.ComponentType<{ className?: string }>> = {
  "Embaixador": Crown,
  "Superfã": Flame,
  "Fã": Heart,
  "Quase fã": UserPlus,
  "Possível fã": Sparkles,
};

export function LevelBadge({ level }: { level: FanLevel }) {
  const Icon = ICONS[level];
  return (
    <Badge variant={levelVariant(level)} className="gap-1">
      <Icon className="h-3 w-3" />
      {level}
    </Badge>
  );
}
