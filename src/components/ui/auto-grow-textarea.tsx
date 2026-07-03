import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/** Ancestral rolável mais próximo (o diálogo/aba que rola), pra preservar seu
 *  scroll ao redimensionar o textarea. null se nada rola acima dele. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Textarea que começa compacto e cresce com o conteúdo (auto-grow) — substitui os
 * textareas gigantes vazios e mostra o texto inteiro sem precisar arrastar/expandir.
 * Enter sem Shift dispara `onEnter` (se passado) em vez de quebrar linha.
 *
 * Fonte única do padrão auto-grow do app (regra transversal §0). `rows` define a
 * altura MÍNIMA (padrão 1); acima disso cresce sozinho conforme o conteúdo.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onBlur,
  onEnter,
  onKeyDown,
  placeholder,
  className,
  rows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  /** Passthrough do keydown (ex.: Cmd/Ctrl+Enter pra salvar). Roda antes do
   * `onEnter`; se chamar preventDefault, o `onEnter` não dispara. */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Resetar height='auto' colapsa o textarea por um instante; se ele estiver
    // acima do ponto de rolagem, o scroll-anchoring do navegador move a viewport
    // e "a tela pula" a cada tecla. Salvamos o scroll do ancestral rolável antes
    // e restauramos depois — assim editar um campo existente não pula (só ao
    // criar linha nova, quando o próprio elemento entra na tela, há deslocamento).
    const scroller = findScrollParent(el);
    const prevTop = scroller ? scroller.scrollTop : 0;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (scroller && scroller.scrollTop !== prevTop) scroller.scrollTop = prevTop;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (onEnter && e.key === "Enter" && !e.shiftKey && !e.defaultPrevented) {
          e.preventDefault();
          onEnter();
        }
      }}
      className={cn(
        "w-full resize-none overflow-hidden rounded-md border bg-background px-2.5 py-1.5 text-sm leading-snug outline-none focus:ring-1 focus:ring-primary",
        className
      )}
    />
  );
}
