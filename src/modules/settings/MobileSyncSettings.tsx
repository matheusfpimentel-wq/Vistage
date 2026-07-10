import { useEffect, useState } from "react";
import { Cloud, KeyRound, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { ConnectedBadge, IntegrationActions } from "@/components/shared/IntegrationCard";
import { currentUser, signIn, signOut, updatePassword, supabase } from "@/lib/supabase";
import { encryptSyncSecret } from "@/lib/crypto";
import {
  getLastSyncAt,
  getSyncEmail,
  hasSyncSecret,
  setSyncEmail,
  setSyncSecret,
  syncNow,
} from "@/lib/mobileSync";
import { displayDocName, useDocumentStore } from "@/lib/document";

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
  // Opt-in "manter login em qualquer PC": guarda a senha CIFRADA no arquivo pra
  // reconectar sozinho numa máquina nova. `rememberEverywhere` é a escolha no
  // formulário de login; `secretStored` reflete se já há senha guardada aqui.
  const [rememberEverywhere, setRememberEverywhere] = useState(false);
  const [secretStored, setSecretStored] = useState(false);
  const [enablePwForm, setEnablePwForm] = useState(false);
  const [enablePw, setEnablePw] = useState("");
  // A conta de sync é vinculada AO ARQUIVO aberto (não ao computador): abrir
  // outro .vistage troca de conta. Mostra qual arquivo esta conta acompanha.
  const docName = displayDocName(useDocumentStore((s) => s.currentName));

  useEffect(() => {
    void (async () => {
      try {
        const u = await currentUser();
        setUserEmail(u?.email ?? null);
        // Pré-preenche o e-mail (a senha não é guardada, por segurança): usa o da
        // conta conectada ou o último salvo no arquivo. Assim, se a sessão
        // expirou, o campo já vem preenchido e basta a senha.
        const savedEmail = u?.email ?? (await getSyncEmail());
        if (savedEmail) setEmail(savedEmail);
        setLastSync(await getLastSyncAt());
        // Se já há senha guardada neste arquivo, o "manter login" já vem marcado.
        const stored = await hasSyncSecret();
        setSecretStored(stored);
        setRememberEverywhere(stored);
      } finally {
        setLoading(false);
      }
    })();
    // A sessão do arquivo pode ser adotada logo DEPOIS deste mount (corrida com o
    // fluxo de abertura). Escutar o auth troca pro estado "conectado" sozinho, em
    // vez de deixar o formulário de login à toa.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /** Cifra a senha (amarrada ao e-mail) e guarda no arquivo — login automático. */
  async function persistSecret(mail: string, pw: string) {
    const packed = await encryptSyncSecret(pw, mail);
    await setSyncSecret(packed);
    setSecretStored(true);
  }

  async function handleLogin() {
    if (!email || !password) return;
    setBusy(true);
    try {
      const u = await signIn(email.trim(), password);
      setUserEmail(u.email ?? null);
      // Guarda o e-mail no arquivo pra pré-preencher nas próximas aberturas.
      void setSyncEmail(u.email ?? email.trim());
      // Opt-in: guarda (ou apaga) a senha cifrada conforme a escolha do usuário.
      if (rememberEverywhere) {
        await persistSecret(u.email ?? email.trim(), password).catch(() => {});
      } else {
        await setSyncSecret(null);
        setSecretStored(false);
      }
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
      // Desconectar apaga também a senha guardada: senão a próxima abertura
      // religaria sozinha, contrariando o "sair".
      await setSyncSecret(null).catch(() => {});
      setSecretStored(false);
      setEnablePwForm(false);
      setUserEmail(null);
    } finally {
      setBusy(false);
    }
  }

  /** Ativa o login automático a partir do estado conectado: confirma a senha
   *  (valida contra o Supabase) e a guarda cifrada. */
  async function handleEnableAuto() {
    if (!userEmail || !enablePw) return;
    setBusy(true);
    try {
      await signIn(userEmail, enablePw); // valida a senha antes de guardar
      await persistSecret(userEmail, enablePw);
      setEnablePw("");
      setEnablePwForm(false);
      toast.success("Login automático ativado. A senha viaja cifrada no arquivo.");
    } catch (e) {
      toast.error(`Senha incorreta: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /** Desativa o login automático: apaga a senha guardada neste arquivo. */
  async function handleDisableAuto() {
    setBusy(true);
    try {
      await setSyncSecret(null);
      setSecretStored(false);
      toast.success("Login automático desativado. A senha guardada foi apagada.");
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
      // Se o login automático está ligado, reencripta com a senha NOVA — senão o
      // segredo guardado ficaria velho e a reconexão em outro PC falharia.
      if (secretStored && userEmail) {
        await persistSecret(userEmail, newPw).catch(() => {});
      }
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

  // Aviso do tradeoff (aparece no login E no estado conectado): guardar a senha
  // dá login automático em outro PC, mas transforma o arquivo em credencial.
  const autoLoginHelp = (
    <>
      Guarda sua senha (cifrada) dentro do arquivo .vistage pra reconectar sozinho
      em outro computador, sem digitar de novo. Como a chave viaja junto do arquivo,
      quem tiver o .vistage pode reusar esse login — só ative se o arquivo fica com
      você. Para proteção de verdade, proteja o próprio .vistage com uma senha (aí a
      senha de sync também fica cifrada por ela). Sem isto, só a sessão viaja e ela
      pode vencer; com isto, entra sempre.
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4" /> Sincronização mobile
          {userEmail && <ConnectedBadge />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : userEmail ? (
          <>
            <IntegrationActions
              timestampLabel={
                lastSync
                  ? `Última sincronização: ${new Date(lastSync).toLocaleString("pt-BR")}`
                  : null
              }
              onSync={() => void handleSync()}
              syncing={busy}
              onDisconnect={() => void handleLogout()}
              extraActions={
                <Button
                  variant="outline"
                  onClick={() => setShowPwForm((v) => !v)}
                  disabled={busy}
                >
                  <KeyRound className="h-4 w-4" /> Trocar senha
                </Button>
              }
            >
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Conta da sincronização</div>
                <div className="font-medium break-all">{userEmail}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Vinculada a {docName ? <strong>{docName}</strong> : "este documento"}. Abrir outro arquivo
                  .vistage troca pela conta dele.
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
                  <div className="text-xs">
                    <div className="flex items-center gap-1 font-medium">
                      Login automático em qualquer PC
                      <InfoHint>{autoLoginHelp}</InfoHint>
                    </div>
                    <div className="text-muted-foreground">
                      {secretStored
                        ? "Ativado: a senha viaja cifrada no arquivo."
                        : "Desativado: só a sessão viaja."}
                    </div>
                  </div>
                  {secretStored ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDisableAuto()}
                      disabled={busy}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEnablePwForm((v) => !v)}
                      disabled={busy}
                    >
                      Ativar
                    </Button>
                  )}
                </div>
              </div>
            </IntegrationActions>

            {enablePwForm && !secretStored && (
              <div className="space-y-2 rounded-md border p-3 sm:max-w-sm">
                <Label className="text-xs">Confirme sua senha para memorizar</Label>
                <Input
                  type="password"
                  value={enablePw}
                  autoComplete="current-password"
                  onChange={(e) => setEnablePw(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleEnableAuto();
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => void handleEnableAuto()}
                  disabled={busy || !enablePw}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Memorizar senha
                </Button>
              </div>
            )}

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
              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  checked={rememberEverywhere}
                  onChange={(e) => setRememberEverywhere(e.target.checked)}
                />
                <span className="flex items-center gap-1">
                  Manter login em qualquer computador
                  <InfoHint>{autoLoginHelp}</InfoHint>
                </span>
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <Button onClick={() => void handleLogin()} disabled={busy || !email || !password}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                Entrar
              </Button>
              <InfoHint>
                A conta fica vinculada a {docName ? <strong>{docName}</strong> : "este documento"}: ela viaja
                dentro do arquivo .vistage, então abrir o mesmo arquivo em outro computador reconecta o celular
                sem digitar a senha de novo.
              </InfoHint>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
