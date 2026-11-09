import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes rodam em Node, FORA do Tauri. O único ponto mockado é a fronteira
// `invoke` do @tauri-apps/api/core (ver src/test/sqliteDb.ts): tudo acima dela
// — o runner de migrations, o backup, o restore — é o código real do app.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // O corpo do teste roda migrations reais sobre SQLite; 30s dá folga pra
    // máquina lenta sem esconder um travamento de verdade.
    testTimeout: 30_000,
  },
});
