import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

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
  placeholder,
  className,
  rows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
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
        if (onEnter && e.key === "Enter" && !e.shiftKey) {
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
