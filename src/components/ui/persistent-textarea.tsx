import { useEffect, useRef } from "react";
import { Textarea, type TextareaProps } from "./textarea";

const PREFIX = "vistage.taheight.";

/**
 * Textarea que lembra a altura para a qual o usuário arrastou a alça de
 * redimensionamento e a restaura ao reabrir. A altura é guardada no
 * localStorage (preferência de exibição da máquina) sob `storageKey`.
 */
export function PersistentTextarea({
  storageKey,
  onMouseUp,
  onBlur,
  ...props
}: TextareaProps & { storageKey: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const saved = localStorage.getItem(PREFIX + storageKey);
      if (saved) el.style.height = saved;
    } catch {
      /* storage indisponível */
    }
  }, [storageKey]);

  function persist() {
    const el = ref.current;
    if (!el || !el.style.height) return;
    try {
      localStorage.setItem(PREFIX + storageKey, el.style.height);
    } catch {
      /* storage cheio/indisponível */
    }
  }

  return (
    <Textarea
      ref={ref}
      onMouseUp={(e) => {
        persist();
        onMouseUp?.(e);
      }}
      onBlur={(e) => {
        persist();
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
