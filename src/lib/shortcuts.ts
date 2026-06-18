import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getDb } from "./db";

/**
 * Event bus simples para "novo item no módulo ativo".
 * Páginas registram um handler via `useNewItemShortcut(openCreate)` e o
 * listener global de Ctrl+N (em App.tsx) dispara `triggerNewItem()`.
 */
const NEW_ITEM_EVENT = "vistage:new-item";
const QUICK_CAPTURE_EVENT = "vistage:quick-capture";

export function triggerNewItem(): void {
  window.dispatchEvent(new CustomEvent(NEW_ITEM_EVENT));
}

export function triggerQuickCapture(): void {
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT));
}

// Intenção de "criar item" disparada por NAVEGAÇÃO (command palette, menu "+").
// Guardamos a rota-alvo; quando a página de destino monta nessa rota, ela abre
// o próprio form de criação. Se já estiver na rota, o chamador usa
// triggerNewItem() direto (a página atual responde na hora).
let pendingNewItemPath: string | null = null;
export function requestNewItemAt(path: string): void {
  pendingNewItemPath = path;
}

export function useNewItemShortcut(handler: () => void): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const listener = () => handler();
    window.addEventListener(NEW_ITEM_EVENT, listener);
    // Intenção pendente vinda de navegação: só a página da rota certa responde.
    if (pendingNewItemPath && pathname === pendingNewItemPath) {
      pendingNewItemPath = null;
      handler();
    }
    return () => window.removeEventListener(NEW_ITEM_EVENT, listener);
  }, [handler, pathname]);
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

// ============================================================
// Atalhos personalizáveis — salvos em app_settings
// ============================================================

export type ShortcutAction = "search" | "newItem" | "quickCapture";

const DEFAULTS: Record<ShortcutAction, string> = {
  search: "k",
  newItem: "n",
  quickCapture: "i",
};

const SETTING_KEYS: Record<ShortcutAction, string> = {
  search: "shortcut.search",
  newItem: "shortcut.newItem",
  quickCapture: "shortcut.quickCapture",
};

const LS_FALLBACK_PREFIX = "vistage.shortcut.";

async function readSetting(key: string): Promise<string | null> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string | null }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [key]
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: string): Promise<void> {
  try {
    const db = getDb();
    await db.execute(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  } catch {
    /* fallback */
  }
  localStorage.setItem(LS_FALLBACK_PREFIX + key, value);
}

/** Mantido em memória para resposta imediata no keydown handler. */
const cache: Record<ShortcutAction, string> = { ...DEFAULTS };
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export async function hydrateShortcuts(): Promise<void> {
  for (const action of Object.keys(DEFAULTS) as ShortcutAction[]) {
    const settingKey = SETTING_KEYS[action];
    const fromDb = await readSetting(settingKey);
    const fromLs =
      typeof window !== "undefined"
        ? localStorage.getItem(LS_FALLBACK_PREFIX + settingKey)
        : null;
    const value = fromDb ?? fromLs ?? DEFAULTS[action];
    cache[action] = value;
  }
  hydrated = true;
  notify();
}

export function getDefaultShortcuts(): Record<ShortcutAction, string> {
  return { ...DEFAULTS };
}

export async function setShortcutKey(
  action: ShortcutAction,
  key: string
): Promise<void> {
  const normalized = key.trim().toLowerCase().slice(0, 1);
  if (!normalized) return;
  cache[action] = normalized;
  await writeSetting(SETTING_KEYS[action], normalized);
  notify();
}

export async function resetShortcuts(): Promise<void> {
  for (const action of Object.keys(DEFAULTS) as ShortcutAction[]) {
    cache[action] = DEFAULTS[action];
    await writeSetting(SETTING_KEYS[action], DEFAULTS[action]);
  }
  notify();
}

export function useShortcutsConfig(): Record<ShortcutAction, string> {
  const [value, setValue] = useState<Record<ShortcutAction, string>>(() => ({
    ...cache,
  }));
  useEffect(() => {
    const fn = () => setValue({ ...cache });
    listeners.add(fn);
    if (!hydrated) void hydrateShortcuts();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

/** Dispatcher pra qual ação corresponde uma tecla pressionada com modKey. */
export function matchShortcut(e: KeyboardEvent): ShortcutAction | null {
  const k = e.key.toLowerCase();
  for (const action of Object.keys(cache) as ShortcutAction[]) {
    if (cache[action] === k) return action;
  }
  return null;
}
