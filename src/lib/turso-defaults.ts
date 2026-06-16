// Credenciais do Turso — lidas das variáveis de ambiente Vite.
// No CI (GitHub Actions), defina VITE_TURSO_URL e VITE_TURSO_TOKEN como secrets.
// Localmente, crie `.env.local` na raiz do projeto com as mesmas vars.
export const DEFAULT_TURSO_URL: string =
  import.meta.env.VITE_TURSO_URL ?? "";

export const DEFAULT_TURSO_TOKEN: string =
  import.meta.env.VITE_TURSO_TOKEN ?? "";
