import { useEffect, useState } from "react";
import { Cloud, KeyRound, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { currentUser, signIn, signOut, updatePassword } from "@/lib/supabase";
import { getLastSyncAt, syncNow } from "@/lib/mobileSync";

export function MobileSyncSettings() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

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
      // sincroniza logo após o login (em segundo plano)
      void syncNow()
        .then(() => getLastSyncAt())
        .then(setLastSync)
        .catch(() => {});
    } catch (e) {
      toast.error(`Falha no login: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const { pending } = await syncNow();
      setLastSync(await getLastSyncAt());
      toast.success(
        pending > 0
          ? `Sincronizado. ${pending} novidade(s) do celular aguardando revisão.`
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

  async function handleChangePassword() {
    if (newPw.length < 6) {
      toast.error("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("As senhas não conferem.");
      return;
    }
    setChangingPw(true);
    try {
      await updatePassword(newPw);
      toast.success("Senha alterada. Use a nova senha no celular.");
      setNewPw("");
      setConfirmPw("");
      setShowPwForm(false);
    } catch (e) {
      toast.error(`Não foi possível trocar a senha: ${(e as Error).message ?? String(e)}`);
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4" /> Sincronização mobile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : userEmail ? (
          <>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Conta da sincronização</div>
              <div className="font-medium break-all">{userEmail}</div>
              {lastSync && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Última sincronização: {new Date(lastSync).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSync()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPwForm((v) => !v)}
                disabled={busy}
              >
                <KeyRound className="h-4 w-4" /> Trocar senha
              </Button>
              <Button variant="outline" onClick={() => void handleLogout()} disabled={busy}>
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </div>

            {showPwForm && (
              <div className="space-y-2 rounded-md border p-3 sm:max-w-sm">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nova senha</Label>
                  <Input
                    type="password"
                    value={newPw}
                    autoComplete="new-password"
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar nova senha</Label>
                  <Input
                    type="password"
                    value={confirmPw}
                    autoComplete="new-password"
                    onChange={(e) => setConfirmPw(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleChangePassword();
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleChangePassword()}
                  disabled={changingPw || !newPw || !confirmPw}
                >
                  {changingPw && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar nova senha
                </Button>
              </div>
            )}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
