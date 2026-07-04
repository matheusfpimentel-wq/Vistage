import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { flushQueue } from "./queue";
import { flushMediaQueue } from "./mediaQueue";
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
// Duas filas: texto (queue) e mídia da GIG (mediaQueue, binário no IndexedDB).
const flushAll = () => {
  void flushQueue();
  void flushMediaQueue();
};
flushAll();
window.addEventListener("online", flushAll);
onResume(flushAll);

// PWA: registra o service worker (instalável + casca offline).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
