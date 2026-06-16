import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Database, Loader2, SkipForward } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/lib/config";

type Props = { onDone: () => void };

export function MigratePage({ onDone }: Props) {
  const { config, patchConfig } = useConfigStore();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [counts, setCounts] = useState<[string, number][]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleMigrate() {
    if (!config?.dbPath) return;
    setRunning(true);
    setError(null);
    try {
      const result = await invoke<[string, number][]>("db_migrate_from_sqlite", {
        sqlitePath: config.dbPath,
      });
      setCounts(result);
      await patchConfig({ migrated: true });
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleSkip() {
    await patchConfig({ migrated: true });
    onDone();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Database className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Migração de dados</span>
          </div>
          <CardTitle>Seus dados anteriores estão prontos para migrar</CardTitle>
          <CardDescription>
            O Vistage agora usa o Turso para guardar seus dados na nuvem com segurança,
            sem risco de corrupção por sync de arquivos. Vamos copiar seus dados existentes
            para lá — é rápido e não-destrutivo (seu arquivo original não é apagado).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!done && !error && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">O que vai acontecer:</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Lemos seu banco local: <code className="text-xs">{config?.dbPath}</code></li>
                <li>Copiamos todas as tabelas para o Turso (nuvem)</li>
                <li>Verificamos a contagem de linhas de cada tabela</li>
              </ol>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Erro durante a migração</p>
              <p className="text-xs mt-1 font-mono break-words">{error}</p>
            </div>
          )}

          {done && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Migração concluída com sucesso!
              </div>
              <div className="max-h-48 overflow-y-auto text-xs font-mono space-y-0.5 text-muted-foreground">
                {counts.map(([table, count]) => (
                  <div key={table} className="flex justify-between gap-4">
                    <span>{table}</span>
                    <span className="text-foreground">{count} linhas</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {!done ? (
              <>
                <Button onClick={handleMigrate} disabled={running}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                  {running ? "Migrando…" : "Migrar agora"}
                </Button>
                <Button variant="outline" onClick={handleSkip} disabled={running}>
                  <SkipForward className="h-4 w-4 mr-2" />
                  Pular (começar limpo)
                </Button>
              </>
            ) : (
              <Button onClick={onDone}>Entrar no Vistage</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
