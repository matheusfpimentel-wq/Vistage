import { useState } from "react";
import { supabase } from "../supabase";

export function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function go() {
    if (!email || !password) return;
    if (isSignup && password.length < 6) {
      setErr("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    const creds = { email: email.trim(), password };
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp(creds);
      if (error) setErr(error.message);
      else if (!data.session) {
        // Confirmação por e-mail habilitada no projeto: ainda não há sessão.
        setInfo("Conta criada! Confirme pelo e-mail enviado e depois entre.");
        setMode("signin");
      }
      // Se já veio sessão, o App detecta o login (onAuthStateChange) e entra.
    } else {
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) setErr(error.message);
    }
    setBusy(false);
  }

  function toggleMode() {
    setMode(isSignup ? "signin" : "signup");
    setErr(null);
    setInfo(null);
  }

  return (
    <div className="center login">
      <div className="logo" aria-hidden="true" />
      <h1>Vistage</h1>
      <p className="muted">
        {isSignup ? "Crie a conta deste arquivo." : "Entre na conta deste arquivo."}
      </p>
      <input
        type="email"
        inputMode="email"
        autoComplete="username"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void go();
        }}
      />
      {err && <p className="error">{err}</p>}
      {info && <p className="muted">{info}</p>}
      <button className="primary" disabled={busy || !email || !password} onClick={() => void go()}>
        {busy ? (isSignup ? "Criando…" : "Entrando…") : isSignup ? "Criar conta" : "Entrar"}
      </button>
      <button className="link" style={{ marginTop: "0.75rem" }} onClick={toggleMode}>
        {isSignup ? "Já tenho conta — entrar" : "Criar uma conta"}
      </button>
    </div>
  );
}
