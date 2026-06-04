import {
  AlertTriangle,
  BookOpen,
  Clock,
  DollarSign,
  Flame,
  Heart,
  Music,
  PartyPopper,
  Star,
  Target,
} from "lucide-react";
import type { AlertIconKey } from "./alerts";

/**
 * Mapeia a chave de ícone (dado portável de `alerts.ts`) para o componente
 * visual. Fica separado do núcleo para que `computeAlerts` continue sem
 * dependência de React/JSX e possa rodar no servidor.
 */
export function AlertIcon({
  icon,
  critical,
  className = "h-3.5 w-3.5",
}: {
  icon: AlertIconKey;
  critical: boolean;
  className?: string;
}) {
  const color = critical ? "text-red-500" : "text-amber-500";
  const cls = `${className} ${color}`;
  switch (icon) {
    case "clock":
      return <Clock className={cls} />;
    case "star":
      return <Star className={cls} />;
    case "flame":
      return <Flame className={cls} />;
    case "music":
      return <Music className={cls} />;
    case "party":
      return <PartyPopper className={cls} />;
    case "book":
      return <BookOpen className={cls} />;
    case "heart":
      return <Heart className={cls} />;
    case "target":
      return <Target className={cls} />;
    case "dollar":
      return <DollarSign className={cls} />;
    case "warning":
    default:
      return <AlertTriangle className={cls} />;
  }
}
