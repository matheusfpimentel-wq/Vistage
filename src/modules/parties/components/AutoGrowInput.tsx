import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Input de 1 linha que cresce com o conteúdo (auto-grow) — substitui os textareas
 * gigantes vazios. Começa com 1 linha e expande conforme digita; Enter sem Shift
 * dispara onEnter (se passado) em vez de quebrar linha.
 */
export function AutoGrowInput({
  value,
  onChange,
  onBlur,
  onEnter,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
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
      rows={1}
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
