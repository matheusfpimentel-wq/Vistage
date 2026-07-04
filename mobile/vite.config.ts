import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" → assets relativos, funciona no subpath do GitHub Pages
// (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // Sem sourcemaps em produção (explícito) — não vazam código nem incham o
    // bundle. É o padrão do Vite; fixado aqui pra não ligar sem querer.
    sourcemap: false,
  },
});
