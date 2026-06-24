import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DATA_CHANGED } from "@/lib/events";
import { countOpenTasksLinkedTo } from "../api";

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
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    function load() {
      void countOpenTasksLinkedTo(entityType, entityId)
        .then((n) => {
          if (alive) setCount(n);
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
  }, [entityType, entityId]);

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
