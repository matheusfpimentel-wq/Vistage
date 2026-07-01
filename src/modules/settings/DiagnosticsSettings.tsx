import { useEffect, useState } from "react";
import { EMPTY_VALUE } from "@/lib/format";
import { appDataDir } from "@tauri-apps/api/path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";

type Diag = {
  schemaVersion: number | null;
  errors: { key: string; value: string }[];
  replica: string;
};

/**
 * Aba de diagnóstico: estado técnico do banco local, pra investigar falhas sem
 * abrir devtools (ex.: quando algo trava no HD externo em outra máquina).
 */
export function DiagnosticsSettings() {
  const [d, setD] = useState<Diag | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const db = getDb();
      let schemaVersion: number | null = null;
      try {
        const rows = await db.select<{ v: number | null }[]>(
          "SELECT MAX(version) AS v FROM _migrations"
        );
        schemaVersion = rows[0]?.v ?? null;
      } catch {
        /* sem tabela _migrations */
      }
      let errors: { key: string; value: string }[] = [];
      try {
        errors = await db.select<{ key: string; value: string }[]>(
          "SELECT key, value FROM app_settings WHERE key LIKE 'migration_error_%' ORDER BY key"
        );
      } catch {
        /* ignora */
      }
      let replica = "";
      try {
        const dir = await appDataDir();
        const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
        replica = `${dir.replace(/[\\/]+$/, "")}${sep}vistage-replica.db`;
      } catch {
        /* ignora */
      }
      if (alive) setD({ schemaVersion, errors, replica });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diagnóstico</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Versão do schema" value={d ? (d.schemaVersion != null ? `v${d.schemaVersion}` : EMPTY_VALUE) : "…"} />
        <Row label="Banco local (réplica)" value={d?.replica || "…"} mono />
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Erros de migração</div>
          {!d ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : d.errors.length === 0 ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Nenhum.
            </p>
          ) : (
            <ul className="space-y-1">
              {d.errors.map((e) => (
                <li
                  key={e.key}
                  className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs"
                >
                  <span className="font-mono font-medium">{e.key.replace("migration_error_", "")}</span>
                  : {e.value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "max-w-[60%] truncate font-mono text-xs" : "text-xs"} title={value}>
        {value}
      </span>
    </div>
  );
}
