import Database from "better-sqlite3";

// Backend SQLite real para os testes, no lugar do libsql que roda no Rust.
//
// A estratégia é mockar UMA fronteira: o `invoke` do @tauri-apps/api/core. Tudo
// acima dela segue sendo o código de produção — `getDb()`, o runner de
// migrations com seu pré-filtro de ALTER e lote atômico, `buildBackupData`,
// `restoreBackup`. Testar uma CÓPIA da lógica não provaria nada sobre o app.
//
// Escolhemos better-sqlite3 e não o `node:sqlite` nativo porque o CI está
// pinado em Node 20 (.github/workflows/build.yml) e o módulo nativo só existe
// no 22+.

/**
 * Converte os placeholders `$N` (estilo Postgres, que o libsql aceita) para os
 * `?` posicionais do better-sqlite3.
 *
 * Não é um `replace` ingênuo de propósito: o app REUSA o mesmo índice em várias
 * queries — `ON CONFLICT(key) DO UPDATE SET value = $2` e
 * `($3 IS NULL OR id <> $3)`, por exemplo. Trocar cada `$N` por `?` na ordem de
 * aparição e repetir o valor correspondente é o que mantém o significado;
 * empurrar os params na ordem original daria valores trocados.
 */
export function toPositional(
  sql: string,
  params: unknown[]
): { sql: string; params: unknown[] } {
  const out: unknown[] = [];
  const converted = sql.replace(/\$(\d+)/g, (_m, n: string) => {
    out.push(params[Number(n) - 1]);
    return "?";
  });
  return { sql: converted, params: out };
}

/** better-sqlite3 recusa boolean e undefined; o app passa os dois às vezes. */
function normalize(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p === undefined) return null;
    return p;
  });
}

/** true se o statement só tem comentário/espaço — o split por `;` do runner de
 *  migrations pode produzir um resto desses, e `prepare` rejeita vazio. */
function isNoop(sql: string): boolean {
  return (
    sql
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim() === ""
  );
}

export type TestDb = {
  raw: Database.Database;
  /** O `invoke` que substitui o do Tauri. */
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
};

// Banco de teste ATIVO. O mock do `invoke` aponta pra cá em vez de pra uma
// instância, porque a fixture já roda migrations enquanto é construída: se o
// teste só ligasse o mock depois de receber o banco, as primeiras escritas
// cairiam no vazio.
let active: TestDb | null = null;

/** O `invoke` que o teste passa pro `vi.mock("@tauri-apps/api/core")`. */
export function testInvoke(
  cmd: string,
  args?: Record<string, unknown>
): Promise<unknown> {
  if (!active) {
    return Promise.reject(
      new Error(`invoke("${cmd}") sem banco de teste ativo — chame createTestDb() primeiro`)
    );
  }
  return active.invoke(cmd, args);
}

/** Banco em memória com as foreign keys ligadas, como o `db_init` faz no Rust. */
export function createTestDb(): TestDb {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");

  function select(sql: string, params: unknown[]) {
    const q = toPositional(sql, params);
    return raw.prepare(q.sql).all(...normalize(q.params));
  }

  function execute(sql: string, params: unknown[]) {
    if (isNoop(sql)) return { rowsAffected: 0, lastInsertId: 0 };
    const q = toPositional(sql, params);
    const r = raw.prepare(q.sql).run(...normalize(q.params));
    return {
      rowsAffected: Number(r.changes),
      lastInsertId: Number(r.lastInsertRowid),
    };
  }

  const invoke = async (
    cmd: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> => {
    switch (cmd) {
      case "db_init":
        return undefined;
      case "db_select":
        return select(args.sql as string, (args.params as unknown[]) ?? []);
      case "db_execute":
        return execute(args.sql as string, (args.params as unknown[]) ?? []);
      case "db_execute_batch": {
        // Mesma garantia do Rust: tudo-ou-nada. A transação do better-sqlite3
        // faz ROLLBACK se qualquer statement lançar.
        const statements = (args.statements ?? []) as {
          sql: string;
          params?: unknown[];
        }[];
        const run = raw.transaction(() => {
          let affected = 0;
          for (const st of statements) {
            affected += execute(st.sql, st.params ?? []).rowsAffected;
          }
          return affected;
        });
        return run();
      }
      default:
        throw new Error(`comando Tauri não mockado nos testes: ${cmd}`);
    }
  };

  const db: TestDb = {
    raw,
    invoke,
    close: () => {
      if (active === db) active = null;
      raw.close();
    },
  };
  active = db;
  return db;
}
