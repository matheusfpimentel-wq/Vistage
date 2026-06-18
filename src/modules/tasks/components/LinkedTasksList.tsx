import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DATA_CHANGED } from "@/lib/events";
import { listTasksLinkedTo } from "../api";
import { statusVariant, priorityVariant, type Task } from "../types";

type Props = {
  entityType: string;
  entityId: number;
  onOpen?: (task: Task) => void;
};

export function LinkedTasksList({ entityType, entityId, onOpen }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    void listTasksLinkedTo(entityType, entityId).then(setTasks);
  }, [entityType, entityId]);

  useEffect(() => {
    function handler() {
      void listTasksLinkedTo(entityType, entityId).then(setTasks);
    }
    window.addEventListener(DATA_CHANGED, handler);
    return () => window.removeEventListener(DATA_CHANGED, handler);
  }, [entityType, entityId]);

  if (tasks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nenhuma tarefa vinculada.</p>
    );
  }

  return (
    <ul className="space-y-1">
      {tasks.map((t) => (
        <li
          key={t.id}
          className={[
            "flex items-center gap-2 rounded px-2 py-1 text-sm",
            onOpen ? "cursor-pointer hover:bg-accent" : "",
          ].join(" ")}
          onClick={() => onOpen?.(t)}
        >
          <Badge variant={statusVariant(t.status)} className="text-[10px] shrink-0">
            {t.status}
          </Badge>
          <span className="flex-1 truncate">{t.title}</span>
          <Badge variant={priorityVariant(t.priority)} className="text-[10px] shrink-0">
            {t.priority}
          </Badge>
          {t.due_date && (
            <span className="text-xs text-muted-foreground shrink-0">
              {t.due_date}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
