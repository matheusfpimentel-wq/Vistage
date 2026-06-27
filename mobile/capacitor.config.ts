import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuração do wrapper nativo (iOS + Android) do companion mobile.
 *
 * O mesmo `mobile/` React vira PWA (Vite) E app nativo (Capacitor). `webDir`
 * aponta pro build do Vite (`dist`). As cascas nativas (ios/ e android/) são
 * geradas localmente com `npx cap add ios|android` (ver CAPACITOR.md) e NÃO são
 * commitadas aqui — quem builda no Mac/Android Studio as cria.
 */
const config: CapacitorConfig = {
  appId: "com.vistage.app",
  appName: "Vistage",
  webDir: "dist",
  backgroundColor: "#0b0b10",
  ios: {
    // O Modo Foco usa Live Activity (ActivityKit) — escrita nativa em Swift,
    // adicionada à casca iOS depois (ver CAPACITOR.md §Live Activity).
    contentInset: "always",
  },
  android: {
    // O Modo Foco usa foreground service com ações de notificação.
    backgroundColor: "#0b0b10",
  },
};

export default config;
