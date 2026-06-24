import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DELETED_KEY,
  DISMISS_KEY,
  generateRaw,
  loadSet,
  saveSet,
  type RawInsight,
} from "./provocations";

/**
 * Gestão das provocações do "dado de insights" (os textinhos que aparecem em
 * Ideias). Lista todas com ocultar/mostrar; as derivadas dos seus dados também
 * podem ser excluídas de vez. Usado na aba Insights das Configurações.
 */
export function ProvocationsManager() {
  const [raw, setRaw] = useState<RawInsight[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    void generateRaw().then(setRaw);
    setDismissed(loadSet(DISMISS_KEY));
    setDeleted(loadSet(DELETED_KEY));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  function toggleHide(key: string) {
    const next = new Set(dismissed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    saveSet(DISMISS_KEY, next);
    setDismissed(next);
  }

  function remove(key: string) {
    const next = new Set(deleted);
    next.add(key);
    saveSet(DELETED_KEY, next);
    setDeleted(next);
  }

  const visible = raw.filter((r) => !deleted.has(r.key));

  return (
    <div className="space-y-1.5">
      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nada por aqui ainda — cadastre OKRs, GIGs ou ideias e elas aparecem.
        </p>
      ) : (
        visible.map((r) => {
          const hidden = dismissed.has(r.key);
          return (
            <div
              key={r.key}
              className={cn(
                "flex items-start justify-between gap-2 rounded-md border p-2",
                hidden && "opacity-60"
              )}
            >
              <p className={cn("min-w-0 flex-1 text-sm leading-snug", hidden && "line-through")}>
                {r.text}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => toggleHide(r.key)}
                  title={hidden ? "Mostrar" : "Ocultar"}
                  aria-label={hidden ? "Mostrar" : "Ocultar"}
                >
                  {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                {r.deletable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove(r.key)}
                    title="Excluir de vez"
                    aria-label="Excluir de vez"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
