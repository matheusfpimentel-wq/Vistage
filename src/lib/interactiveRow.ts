import type { KeyboardEvent } from "react";

/**
 * Anel de foco visível para uma LINHA/card clicável (WCAG 2.4.7). Usa `outline`
 * (não `ring`) porque box-shadow em `<tr>` é renderizado de forma inconsistente;
 * outline aparece de forma confiável. `-outline-offset-2` joga o traço pra DENTRO
 * pra não ser cortado pelo overflow da tabela. Só aparece na navegação por teclado.
 */
export const INTERACTIVE_ROW_CLASS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))]";

/**
 * Props pra tornar uma LINHA/card clicável operável por teclado (WCAG 2.1.1):
 * foco (`tabIndex`), ativação por Enter/Espaço e clique. Espalhe no elemento da
 * linha JUNTO com `INTERACTIVE_ROW_CLASS` na className. Botões/checkboxes DENTRO
 * da linha continuam funcionando: o guard `target !== currentTarget` evita que o
 * Enter/Espaço deles dispare a abertura da linha, e eles devem chamar
 * `stopPropagation` no próprio onClick pra não abrir o item ao clicar.
 */
export function interactiveRowProps(onActivate: () => void): {
  tabIndex: 0;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
} {
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // foco num controle interno
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
