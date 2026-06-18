import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" → assets relativos, funciona no subpath do GitHub Pages
// (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
