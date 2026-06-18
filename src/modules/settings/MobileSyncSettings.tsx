import { useEffect, useState } from "react";
import { Cloud, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { currentUser, signIn, signOut } from "@/lib/supabase";
import { getLastSyncAt, syncNow } from "@/lib/mobileSync";

export function MobileSyncSettings() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const u = await currentUser();
        setUserEmail(u?.email ?? null);
        setLastSync(await getLastSyncAt());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleLogin() {
    if (!email || !password) return;
    setBusy(true);
    try {
      const u = await signIn(email.trim(), password);
      setUserEmail(u.email ?? null);
      setPassword("");
      toast.success("Conectado ao Supabase.");
    } catch (e) {
      toast.error(`Falha no login: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const { pulled } = await syncNow();
      setLastSync(await getLastSyncAt());
      toast.success(
        pulled > 0
          ? `Sincronizado. ${pulled} captura(s) do celular importada(s).`
          : "Sincronizado."
      );
    } catch (e) {
      toast.error(`Erro na sincronização: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await signOut();
      setUserEmail(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4" /> Sincronização mobile
        </CardTitle>
        <CardDescription>
          Espelha agenda, saldo, contato do dia e foco para você consultar no
          celular (PWA), e importa as capturas feitas no telefone. Finanças
          detalhadas nunca saem do computador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : userEmail ? (
          <>
            <p className="text-sm">
              Conectado como <span className="font-medium">{userEmail}</span>.
            </p>
            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Última sincronização: {new Date(lastSync).toLocaleString("pt-BR")}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSync()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar agora
              </Button>
              <Button variant="outline" onClick={() => void handleLogout()} disabled={busy}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-2 sm:max-w-sm">
              <Input
                type="email"
                placeholder="E-mail da conta"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Senha"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLogin();
                }}
              />
            </div>
            <Button onClick={() => void handleLogin()} disabled={busy || !email || !password}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
              Entrar
            </Button>
            <p className="text-xs text-muted-foreground">
              Use a conta criada para este arquivo. (Cadastro pela própria tela
              vem na próxima fase.)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
