import { Capacitor } from "@capacitor/core";

/**
 * Camada fina sobre os recursos nativos do Capacitor com FALLBACK web. O mesmo
 * código roda no PWA (hoje) e no app nativo (depois): no nativo usa os plugins
 * do Capacitor; no navegador cai pras APIs web equivalentes. Os plugins só são
 * importados dinamicamente quando nativo — o bundle do PWA não depende deles em
 * runtime.
 */

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Haptic de confirmação (toque cego na captura ao vivo). Nunca lança. */
export async function haptic(style: "light" | "medium" | "heavy" = "medium"): Promise<void> {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
      await Haptics.impact({ style: map[style] });
      return;
    }
  } catch {
    /* cai pro vibrate web */
  }
  try {
    const ms = style === "heavy" ? 30 : style === "light" ? 8 : 15;
    navigator.vibrate?.(ms);
  } catch {
    /* sem vibração disponível */
  }
}

/**
 * Storage chave-valor durável. No nativo usa `@capacitor/preferences` (sem
 * evicção, sobrevive a fechar o app); no PWA usa `localStorage`. Async pra casar
 * com a API nativa.
 */
export async function storeGet(key: string): Promise<string | null> {
  try {
    if (isNative()) {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value ?? null;
    }
  } catch {
    /* cai pro localStorage */
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function storeSet(key: string, value: string): Promise<void> {
  try {
    if (isNative()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
      return;
    }
  } catch {
    /* cai pro localStorage */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage cheio/indisponível */
  }
}

/**
 * Registra um callback pra quando o app volta ao primeiro plano (resume) —
 * gatilho pra dar flush na fila offline. No nativo usa o evento `appStateChange`
 * do Capacitor; no PWA usa `visibilitychange`. Devolve a função de cleanup.
 */
export function onResume(cb: () => void): () => void {
  if (isNative()) {
    let remove: (() => void) | null = null;
    void import("@capacitor/app").then(({ App }) => {
      const handle = App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) cb();
      });
      remove = () => void handle.then((h) => h.remove());
    });
    return () => remove?.();
  }
  const onVis = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}
