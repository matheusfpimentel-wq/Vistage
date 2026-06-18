import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/lib/config";
import { toast } from "@/components/ui/toaster";
import { DEFAULT_TURSO_TOKEN, DEFAULT_TURSO_URL } from "@/lib/turso-defaults";

type DiagResult = {
  replica_file: { exists: boolean; size_bytes: number; size_kb: string };
  turso_url: string;
  turso_token_len: number;
  local_conn?: string;
  row_counts: Record<string, number | string>;
  turso_direct: {
    ok: boolean;
    ms?: number;
    error?: string;
    row_counts?: Record<string, number | string>;
  };
};

export function DbDiagnostics() {
  const { config } = useConfigStore();
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<DiagResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncNow() {
    setSyncing(true);
    try {
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      // Usa HTTP direto (new_remote) — o protocolo de sync embarcado pode não
      // estar disponível no ambiente. HTTP já provou funcionar no diagnóstico.
      const result = await invoke<[string, number][]>("db_pull_from_turso", {
        tursoUrl,
        tursoToken,
      });
      const total = result.reduce((s: number, [, n]: [string, number]) => s + n, 0);
      toast.success(`${total} registros importados. Rodando diagnóstico…`);
      await run();
    } catch (e) {
      toast.error(`Falha ao importar: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const dataDir = await appDataDir();
      const sep = dataDir.includes("\\") && !dataDir.includes("/") ? "\\" : "/";
      const replicaPath = `${dataDir.replace(/[\\/]+$/, "")}${sep}vistage-replica.db`;
      const tursoUrl = config?.tursoUrl ?? DEFAULT_TURSO_URL;
      const tursoToken = config?.tursoToken ?? DEFAULT_TURSO_TOKEN;
      const r = await invoke<DiagResult>("db_diagnostics", {
        replicaPath,
        tursoUrl,
        tursoToken,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Diagnóstico de sincronização
        </CardTitle>
        <CardDescription>
          Testa a conexão com o Turso, conta linhas nas tabelas principais na
          réplica local e direto na nuvem, e reporta o resultado do sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={run} disabled={running || syncing} variant="outline">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {running ? "Investigando…" : "Rodar diagnóstico"}
          </Button>
          <Button onClick={syncNow} disabled={running || syncing} variant="outline">
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive font-mono">{error}</p>
        )}

        {result && (
          <div className="space-y-4 text-sm">
            {/* Arquivo local */}
            <Section title="Réplica local">
              <Row
                label="Arquivo existe"
                value={result.replica_file.exists ? "✓ sim" : "✗ não"}
                ok={result.replica_file.exists}
              />
              {result.replica_file.exists && (
                <Row label="Tamanho" value={result.replica_file.size_kb} />
              )}
            </Section>

            {/* Turso config */}
            <Section title="Configuração Turso">
              <Row label="URL" value={result.turso_url || "(vazio)"} ok={!!result.turso_url} />
              <Row
                label="Token"
                value={
                  result.turso_token_len > 0
                    ? `${result.turso_token_len} caracteres`
                    : "(vazio — sem token)"
                }
                ok={result.turso_token_len > 0}
              />
            </Section>

            {/* Contagem local */}
            <Section title="Linhas na réplica LOCAL (o que o app vê)">
              {result.local_conn && (
                <Row label="conexão" value={result.local_conn} ok={false} />
              )}
              {Object.entries(result.row_counts).map(([t, n]) => (
                <Row
                  key={t}
                  label={t}
                  value={String(n)}
                  ok={typeof n === "number"}
                  warn={typeof n === "number" && n === 0 && ["gigs","students","classes","content"].includes(t)}
                />
              ))}
            </Section>

            {/* Contagem direta no Turso */}
            <Section title={`Linhas DIRETO no Turso (bypass réplica)${result.turso_direct.ok && result.turso_direct.ms != null ? ` — ${result.turso_direct.ms}ms` : ""}`}>
              {result.turso_direct.ok ? (
                Object.entries(result.turso_direct.row_counts ?? {}).map(([t, n]) => (
                  <Row
                    key={t}
                    label={t}
                    value={String(n)}
                    ok={typeof n === "number"}
                    warn={typeof n === "number" && n === 0 && ["gigs","students","classes","content"].includes(t)}
                  />
                ))
              ) : (
                <Row label="Erro" value={result.turso_direct.error ?? "falhou"} ok={false} />
              )}
            </Section>

            {/* Diagnóstico automático */}
            <Diagnosis result={result} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{title}</p>
      <div className="rounded-md border divide-y text-xs font-mono">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          ok === false
            ? "text-destructive"
            : warn
            ? "text-amber-500"
            : "text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function Diagnosis({ result }: { result: DiagResult }) {
  const lines: { icon: "ok" | "warn" | "err"; msg: string }[] = [];

  const directGigs = result.turso_direct.ok
    ? (result.turso_direct.row_counts?.["gigs"] as number | undefined)
    : undefined;
  const localGigs = result.row_counts["gigs"] as number | undefined;

  if (!result.turso_direct.ok) {
    lines.push({ icon: "err", msg: `Não conseguiu conectar direto ao Turso: ${result.turso_direct.error}. Verifique URL e token (provavelmente é problema de rede ou credencial — não de dados perdidos).` });
  } else if (directGigs === 0) {
    lines.push({ icon: "err", msg: "O Turso está VAZIO — não tem GIGs. Os dados nunca chegaram à nuvem. Use 'Salvar manualmente' na máquina que tem os dados para enviá-los à nuvem." });
  } else if (typeof directGigs === "number" && directGigs > 0) {
    lines.push({ icon: "ok", msg: `O Turso TEM ${directGigs} GIGs. Os dados estão seguros na nuvem.` });
    // Compara com o local
    if (typeof localGigs === "number" && localGigs === 0) {
      lines.push({ icon: "err", msg: "Mas a réplica local está VAZIA. O download não está acontecendo. Use 'Baixar tudo da nuvem' para recriar a réplica do zero." });
    } else if (typeof localGigs === "number" && localGigs > 0) {
      const localMig = result.row_counts["_migrations"] as number | undefined;
      const tursoMig = result.turso_direct.row_counts?.["_migrations"] as number | undefined;
      const localAhead = typeof localMig === "number" && typeof tursoMig === "number" && localMig > tursoMig;
      const tursoHasMoreGigs = directGigs > localGigs;

      if (localAhead && tursoHasMoreGigs) {
        // Divergência bidirecional: cada lado tem escritas que o outro não tem.
        lines.push({
          icon: "err",
          msg:
            `DIVERGÊNCIA: a réplica local está À FRENTE no schema (_migrations ${localMig} vs ${tursoMig} na nuvem) ` +
            `mas ATRÁS nos dados (${localGigs} vs ${directGigs} GIGs). Os dois bancos forkaram — ` +
            `esta máquina tem escritas que nunca foram empurradas pro Turso, e o Turso tem GIGs que nunca foram puxadas. ` +
            `NÃO use "Baixar tudo da nuvem" (perderia o que só existe aqui). Use "Sincronizar agora" primeiro para empurrar as escritas locais.`,
        });
      } else if (localGigs !== directGigs) {
        lines.push({
          icon: "warn",
          msg: `A réplica local tem ${localGigs} GIGs e o Turso ${directGigs} — ainda não estão idênticos. Rode "Sincronizar agora" e confira de novo.`,
        });
      } else {
        lines.push({ icon: "ok", msg: `A réplica local tem ${localGigs} GIGs — está sincronizada.` });
      }
    }
  }

  if (!result.replica_file.exists) {
    lines.push({ icon: "warn", msg: "Réplica local não existe ainda. Será criada no próximo boot." });
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Conclusão</p>
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {l.icon === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />}
            {l.icon === "warn" && <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />}
            {l.icon === "err" && <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />}
            <span>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
