import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { supabase } from "../supabase";
import { sendCapture } from "../capture";
import { haptic } from "../native";

type Task = {
  source_id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  category: string | null;
};

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

const GROUP_ORDER = ["Atrasadas", "Hoje", "Amanhã", "Próximos 7 dias", "Depois", "Sem data"] as const;
type Group = (typeof GROUP_ORDER)[number];

function bucketOf(due: string | null, today: string, tomorrow: string, weekEnd: string): Group {
  if (!due) return "Sem data";
  const d = due.slice(0, 10);
  if (d < today) return "Atrasadas";
  if (d === today) return "Hoje";
  if (d === tomorrow) return "Amanhã";
  if (d <= weekEnd) return "Próximos 7 dias";
  return "Depois";
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

  const complete = useCallback(async (t: Task) => {
    // Marca otimista; a conclusão real acontece quando o PC sincronizar.
    setDone((s) => new Set(s).add(t.source_id));
    void haptic("medium");
    try {
      await sendCapture("task_done", { task_id: Number(t.source_id) });
    } catch {
      setDone((s) => {
        const n = new Set(s);
        n.delete(t.source_id);
        return n;
      });
    }
  }, []);

  const { groups, total } = useMemo(() => {
    const now = new Date();
    const today = localISO(now);
    const tomorrow = localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const weekEnd = localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
    const pending = tasks.filter((t) => !done.has(t.source_id));
    const map = new Map<Group, Task[]>();
    for (const t of pending) {
      const g = bucketOf(t.due_date, today, tomorrow, weekEnd);
      const arr = map.get(g);
      if (arr) arr.push(t);
      else map.set(g, [t]);
    }
    return { groups: map, total: pending.length };
  }, [tasks, done]);

  return (
    <div className="screen">
      <div className="row-between">
        <h2 className="screen-title">Tarefas</h2>
        {done.size > 0 && <span className="pill">{done.size} concluída(s) →PC</span>}
      </div>

      {loading ? (
        <div className="center">
          <span className="spinner" />
        </div>
      ) : total === 0 ? (
        <p className="muted">Nada pendente por aqui. 🎉</p>
      ) : (
        <>
          {GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
            <section key={g} className="task-group">
              <h3 className={"task-group-h" + (g === "Atrasadas" ? " overdue" : "")}>
                {g} · {groups.get(g)!.length}
              </h3>
              <ul className="list">
                {groups.get(g)!.map((t) => (
                  <SwipeTask key={t.source_id} t={t} onComplete={() => void complete(t)} />
                ))}
              </ul>
            </section>
          ))}
          <p className="muted small" style={{ marginTop: "0.6rem" }}>
            Toque no círculo ou <strong>deslize pra esquerda</strong> pra concluir.
          </p>
        </>
      )}
      {done.size > 0 && (
        <p className="muted small">As concluídas somem aqui e fecham de vez quando o PC sincronizar.</p>
      )}
    </div>
  );
}

/** Linha com deslizar-pra-concluir (revela "✓ Concluir" e dispara no limiar). */
function SwipeTask({ t, onComplete }: { t: Task; onComplete: () => void }) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const dragging = startX.current != null;
  const due = fmtDue(t.due_date);

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchMove(e: TouchEvent) {
    if (startX.current == null) return;
    const d = e.touches[0].clientX - startX.current;
    setDx(Math.min(0, Math.max(-120, d))); // só esquerda, com teto
  }
  function onTouchEnd() {
    startX.current = null;
    if (dx <= -80) {
      setDx(-400); // desliza pra fora
      onComplete();
    } else {
      setDx(0); // volta
    }
  }

  return (
    <li className="swipe-wrap">
      <span className="swipe-behind" aria-hidden>
        ✓ Concluir
      </span>
      <div
        className="item task-row swipe-fore"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 0.2s ease" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button className="check" aria-label="Concluir tarefa" onClick={onComplete} />
        <div className="grow">
          <strong>{t.title}</strong>
          {(t.category || t.priority || due) && (
            <span className="muted small"> {[t.category, t.priority, due].filter(Boolean).join(" · ")}</span>
          )}
        </div>
      </div>
    </li>
  );
}
