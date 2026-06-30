import type { KeyboardEvent } from "react";

/**
 * Handler de `onKeyDown` para o DialogContent de um formulário: pressionar
 * Enter/Return salva e fecha (a função `save` deve validar e fechar o diálogo).
 *
 * NÃO dispara quando:
 * - o cursor está num <textarea> (Enter = quebra de linha);
 * - um campo interno já tratou o Enter (chamou preventDefault — ex.: adicionar
 *   tag, linha de lista, busca);
 * - há modificador (Shift/Ctrl/Cmd/Alt) ou composição de IME em andamento;
 * - o foco está num botão, select, link ou combobox/listbox (têm Enter próprio).
 */
export function onEnterSave(save: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    if (e.defaultPrevented) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.nativeEvent as { isComposing?: boolean }).isComposing) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT" || tag === "A") return;
    if (t.isContentEditable) return;
    const role = t.getAttribute?.("role");
    if (
      role === "combobox" || role === "listbox" || role === "menu" ||
      role === "menuitem" || role === "option" || role === "switch"
    ) {
      return;
    }
    e.preventDefault();
    save();
  };
}
