import type { ReactNode } from "react";

/**
 * Cabeçalho padrão dos módulos: ações sempre numa linha à direita no topo
 * (o botão "novo" é o último, mais à direita) e, abaixo, os filtros/conteúdo.
 * Centraliza o layout pra todo módulo manter o botão de criação no mesmo lugar.
 */
export function PageToolbar({
  actions,
  children,
}: {
  /** Botões de ação. O primário deve ser o ÚLTIMO (fica mais à direita). */
  actions?: ReactNode;
  /** Linha(s) de filtros/busca/seletor de visualização, abaixo das ações. */
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 bg-background pt-1 pb-3 flex flex-col gap-3">
      {actions ? <div className="flex items-center justify-end gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}
