import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  DEFAULT_NAV,
  loadOrderedNav,
  saveNavOrder,
  type NavItem,
} from "@/lib/nav";

export function MenuOrderSettings() {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);

  useEffect(() => {
    void loadOrderedNav().then(setNav);
  }, []);

  // Só os itens reordenáveis (Dashboard e Configurações são fixos).
  const reorderable = nav.filter((i) => !i.fixed);

  async function persist(next: NavItem[]) {
    setNav(next);
    await saveNavOrder(next.filter((i) => !i.fixed).map((i) => i.to));
  }

  function move(to: string, dir: -1 | 1) {
    const idxInReorderable = reorderable.findIndex((i) => i.to === to);
    const targetIdx = idxInReorderable + dir;
    if (targetIdx < 0 || targetIdx >= reorderable.length) return;
    const newReorderable = [...reorderable];
    const [moved] = newReorderable.splice(idxInReorderable, 1);
    newReorderable.splice(targetIdx, 0, moved);
    // Reconstrói o nav completo: Dashboard fixo no topo, restante reordenado,
    // Configurações fixo no fim (mantém a ordem original dos fixos).
    const head = nav.filter((i) => i.fixed && i.to === "/");
    const tail = nav.filter((i) => i.fixed && i.to !== "/");
    void persist([...head, ...newReorderable, ...tail]);
  }

  async function reset() {
    setNav(DEFAULT_NAV);
    await saveNavOrder(DEFAULT_NAV.filter((i) => !i.fixed).map((i) => i.to));
    toast.success("Ordem do menu restaurada");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ordem do menu lateral</CardTitle>
            <CardDescription>
              Use as setas para reordenar os módulos. Dashboard fica sempre no
              topo e Configurações sempre no fim.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {reorderable.map(({ to, label, icon: Icon }, i) => (
            <li
              key={to}
              className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm">{label}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={i === 0}
                  onClick={() => move(to, -1)}
                  aria-label={`Mover ${label} para cima`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={i === reorderable.length - 1}
                  onClick={() => move(to, 1)}
                  aria-label={`Mover ${label} para baixo`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
