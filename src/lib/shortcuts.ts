import { useEffect } from "react";

/**
 * Event bus simples para "novo item no módulo ativo".
 * Páginas registram um handler via `useNewItemShortcut(openCreate)` e o
 * listener global de Ctrl+N (em App.tsx) dispara `triggerNewItem()`.
 */
const NEW_ITEM_EVENT = "musicgest:new-item";
const QUICK_CAPTURE_EVENT = "musicgest:quick-capture";

export function triggerNewItem(): void {
  window.dispatchEvent(new CustomEvent(NEW_ITEM_EVENT));
}

export function triggerQuickCapture(): void {
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT));
}

export function useNewItemShortcut(handler: () => void): void {
  useEffect(() => {
    const listener = () => handler();
    window.addEventListener(NEW_ITEM_EVENT, listener);
    return () => window.removeEventListener(NEW_ITEM_EVENT, listener);
  }, [handler]);
}

export function useQuickCaptureEvent(handler: () => void): void {
  useEffect(() => {
    const listener = () => handler();
    window.addEventListener(QUICK_CAPTURE_EVENT, listener);
    return () => window.removeEventListener(QUICK_CAPTURE_EVENT, listener);
  }, [handler]);
}

/** Verdadeiro se o evento veio do meta (Cmd no Mac) ou Ctrl no Windows/Linux. */
export function isModKey(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}
