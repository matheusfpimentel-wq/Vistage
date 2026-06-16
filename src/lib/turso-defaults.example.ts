// Template versionado. Copie para `turso-defaults.ts` (ignorado pelo git) e
// preencha com as credenciais reais do seu banco Turso:
//
//   cp src/lib/turso-defaults.example.ts src/lib/turso-defaults.ts
//
// A URL vem de `turso db show <db> --url` e o token de
// `turso db tokens create <db>`.
export const DEFAULT_TURSO_URL = "libsql://SEU-BANCO.turso.io";
export const DEFAULT_TURSO_TOKEN = "SEU_TOKEN_AQUI";
