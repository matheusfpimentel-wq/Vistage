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
  NAV_GROUP_ORDER,
  loadOrderedNav,
  saveNavOrder,
  type NavGroup,
  type NavItem,
} from "@/lib/nav";

export function MenuOrderSettings() {
  const [nav, setNav] = useState<NavItem[]>(DEFAULT_NAV);

  useEffect(() => {
    void loadOrderedNav().then(setNav);
  }, []);

  // Só os itens reordenáveis (Dashboard e Configurações são fixos).
  const reorderable = nav.filter((i) => !i.fixed);

  async function persist(nextReorderable: NavItem[]) {
    const head = nav.filter((i) => i.fixed && i.to === "/");
    const tail = nav.filter((i) => i.fixed && i.to !== "/");
    const next = [...head, ...nextReorderable, ...tail];
    setNav(next);
    await saveNavOrder(nextReorderable.map((i) => i.to));
  }

  /** Move um item dentro do seu próprio grupo e reconstrói a ordem global. */
  function move(group: NavGroup, to: string, dir: -1 | 1) {
    const groupItems = reorderable.filter((i) => i.group === group);
    const idx = groupItems.findIndex((i) => i.to === to);
    const target = idx + dir;
    if (target < 0 || target >= groupItems.length) return;
    const reordered = [...groupItems];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    // Reconstrói o flat list mantendo a ordem dos grupos e a nova ordem interna.
    const next = NAV_GROUP_ORDER.flatMap((g) =>
      g === group ? reordered : reorderable.filter((i) => i.group === g)
    );
    void persist(next);
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
              Reordene os módulos dentro de cada grupo. Dashboard fica sempre no
              topo e Configurações sempre no fim.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {NAV_GROUP_ORDER.map((group) => {
          const groupItems = reorderable.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="space-y-1">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
              <ul className="space-y-1">
                {groupItems.map(({ to, label, icon: Icon }, i) => (
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
                        onClick={() => move(group, to, -1)}
                        aria-label={`Mover ${label} para cima`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={i === groupItems.length - 1}
                        onClick={() => move(group, to, 1)}
                        aria-label={`Mover ${label} para baixo`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
