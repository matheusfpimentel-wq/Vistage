import { Badge } from "@/components/ui/badge";
import type { ContactType } from "../types";

const VARIANT_BY_TYPE: Record<
  ContactType,
  "default" | "secondary" | "outline" | "info" | "success" | "warning"
> = {
  Contratante: "info",
  Booker: "warning",
  "Produtor de eventos": "default",
  "DJ parceiro": "success",
  Músico: "success",
  Influencer: "secondary",
  "Gerente de Club": "outline",
  "Dono de Club": "outline",
  Outros: "outline",
};

export function TypeBadges({ types }: { types: ContactType[] }) {
  if (types.length === 0) {
    return <span className="text-xs text-muted-foreground">sem tipo</span>;
  }
  return (
    <div className="inline-flex flex-wrap gap-1">
      {types.map((t) => (
        <Badge key={t} variant={VARIANT_BY_TYPE[t]} className="whitespace-nowrap">
          {t}
        </Badge>
      ))}
    </div>
  );
}
