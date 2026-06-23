import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertIcon } from "@/modules/revisao/alertIcons";
import { loadActionItemsForGroup } from "@/modules/revisao/actionItems";
import type { AlertItem } from "@/modules/revisao/alerts";

/**
 * "O que precisa de você": lista os itens acionáveis do grupo (mesma lógica do
 * sininho), cada um clicável → leva direto pro lugar. Crítico = vermelho.
 */
export function ActionPanel({ group }: { group: string }) {
  const [items, setItems] = useState<AlertItem[] | null>(null);

  useEffect(() => {
    let active = true;
    void loadActionItemsForGroup(group).then((it) => {
      if (active) setItems(it);
    });
    return () => {
      active = false;
    };
  }, [group]);

  // Quando nada precisa do usuário (ou ainda carregando), o painel simplesmente
  // não aparece — sem card "Tudo em ordem", sem ruído. Só surge quando há algum
  // item acionável de fato.
  if (items === null || items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">O que precisa de você</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {items.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              className={cn(
                "flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition hover:border-primary",
                a.critical
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
              )}
            >
              <AlertIcon
                icon={a.icon}
                critical={a.critical}
                className="h-4 w-4 shrink-0"
              />
              <span className={cn(a.critical && "font-medium")}>{a.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
