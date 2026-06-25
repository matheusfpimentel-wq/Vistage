import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rolagem com setas que aparecem só quando há overflow e, ao passar/parar o
 * mouse em cima, rolam sozinhas (requestAnimationFrame). Mesma UX do rail
 * compacto, reaproveitável em qualquer container vertical (ex.: o menu lateral
 * expandido). O consumidor liga `scrollRef` no elemento rolável, `onScroll` em
 * `updateArrows`, e renderiza as setas conforme `arrows.up`/`arrows.down`.
 */
export function useHoverScroll<T extends HTMLElement>() {
  const scrollRef = useRef<T>(null);
  const rafRef = useRef<number | null>(null);
  const [arrows, setArrows] = useState({ up: false, down: false });

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const can = el.scrollHeight - el.clientHeight > 4;
    setArrows({
      up: can && el.scrollTop > 4,
      down: can && el.scrollTop < el.scrollHeight - el.clientHeight - 4,
    });
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const startAutoScroll = useCallback(
    (dir: number) => {
      stopAutoScroll();
      const tick = () => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop += dir * 5;
          updateArrows();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopAutoScroll, updateArrows]
  );

  const scrollByStep = useCallback((dy: number) => {
    scrollRef.current?.scrollBy({ top: dy, behavior: "smooth" });
  }, []);

  // Recalcula no mount, no resize do elemento e da janela. Mudanças de conteúdo
  // (recolher grupo, etc.) o consumidor dispara chamando updateArrows num effect.
  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return stopAutoScroll;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    window.addEventListener("resize", updateArrows);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateArrows);
      stopAutoScroll();
    };
  }, [updateArrows, stopAutoScroll]);

  return { scrollRef, arrows, updateArrows, startAutoScroll, stopAutoScroll, scrollByStep };
}
