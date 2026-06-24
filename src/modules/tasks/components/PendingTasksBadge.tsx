import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DATA_CHANGED } from "@/lib/events";
import { countOpenTasksLinkedTo } from "../api";
import { usePendingTasksCount } from "./PendingTasksContext";

type Props = {
  entityType: string;
  entityId: number;
  /** Esconde quando não há tarefas abertas (padrão: true). */
  hideWhenZero?: boolean;
  className?: string;
};

/** Mostra quantas tarefas abertas estão vinculadas a uma entidade. */
export function PendingTasksBadge({
  entityType,
  entityId,
  hideWhenZero = true,
  className,
}: Props) {
  // Se houver um PendingTasksProvider cobrindo este tipo, usamos a contagem
  // compartilhada (1 query agrupada pra lista toda). Senão, fallback: query
  // própria por entidade — preserva o comportamento antigo fora de listas.
  const shared = usePendingTasksCount(entityType, entityId);
  const [selfCount, setSelfCount] = useState(0);

  useEffect(() => {
    if (shared !== null) return; // provider cuida da contagem
    let alive = true;
    function load() {
      void countOpenTasksLinkedTo(entityType, entityId)
        .then((n) => {
          if (alive) setSelfCount(n);
        })
        .catch(() => {
          /* contagem é só um selo; falha não deve derrubar a lista */
        });
    }
    load();
    window.addEventListener(DATA_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(DATA_CHANGED, load);
    };
  }, [entityType, entityId, shared]);

  const count = shared !== null ? shared : selfCount;
  if (hideWhenZero && count === 0) return null;

  return (
    <Badge
      variant="secondary"
      className={["gap-1", className].filter(Boolean).join(" ")}
      title={`${count} tarefa(s) aberta(s)`}
    >
      <ListTodo className="h-3 w-3" />
      {count}
    </Badge>
  );
}
