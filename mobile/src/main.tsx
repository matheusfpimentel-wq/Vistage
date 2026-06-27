import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { flushQueue } from "./queue";
import { onResume } from "./native";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Fila offline: sobe o que está pendente ao abrir, ao voltar a ficar online e
// ao trazer o app de volta ao primeiro plano (resume nativo / visibilidade web).
void flushQueue();
window.addEventListener("online", () => void flushQueue());
onResume(() => void flushQueue());

// PWA: registra o service worker (instalável + casca offline).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
