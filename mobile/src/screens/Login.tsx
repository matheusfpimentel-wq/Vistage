import { useState } from "react";
import { supabase } from "../supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (!email || !password) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setErr(error.message);
    setBusy(false);
  }

  return (
    <div className="center login">
      <div className="logo" aria-hidden="true" />
      <h1>Vistage</h1>
      <p className="muted">Entre na conta deste arquivo.</p>
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
        autoComplete="current-password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void go();
        }}
      />
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={busy || !email || !password} onClick={() => void go()}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </div>
  );
}
