import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";

type Task = {
  source_id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  category: string | null;
};

function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function Tarefas() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tasks_mirror")
      .select("source_id, title, priority, due_date, category")
      .order("due_date", { ascending: true, nullsFirst: false });
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(t: Task) {
    // Marca otimista; a conclusão real acontece quando o PC sincronizar.
    setDone((s) => new Set(s).add(t.source_id));
    try {
      await sendCapture("task_done", { task_id: Number(t.source_id) });
    } catch {
      // reverte se falhar o envio
      setDone((s) => {
        const n = new Set(s);
        n.delete(t.source_id);
        return n;
      });
    }
  }

  const pending = tasks.filter((t) => !done.has(t.source_id));

  return (
    <div className="screen">
      <div className="row-between">
        <h2 className="screen-title">Tarefas</h2>
        {done.size > 0 && <span className="pill">{done.size} concluída(s) →PC</span>}
      </div>

      {loading ? (
        <div className="center"><span className="spinner" /></div>
      ) : pending.length === 0 ? (
        <p className="muted">Nada pendente por aqui. 🎉</p>
      ) : (
        <ul className="list">
          {pending.map((t) => {
            const due = fmtDue(t.due_date);
            return (
              <li key={t.source_id} className="item task-row">
                <button
                  className="check"
                  aria-label="Concluir tarefa"
                  onClick={() => void complete(t)}
                />
                <div className="grow">
                  <strong>{t.title}</strong>
                  {(t.category || t.priority || due) && (
                    <span className="muted small">
                      {" "}
                      {[t.category, t.priority, due].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {done.size > 0 && (
        <p className="muted small">
          As concluídas somem aqui e fecham de vez quando o PC sincronizar.
        </p>
      )}
    </div>
  );
}
