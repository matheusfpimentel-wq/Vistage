/**
 * Prompt imperativo de senha (estilo confirmDialog). Um componente
 * PasswordPromptDialog registra o resolvedor ao montar; promptPassword abre o
 * diálogo e resolve com a senha digitada (ou null se cancelar).
 */
export type PasswordPromptOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Pede a senha duas vezes (definir/proteger). */
  requireConfirm?: boolean;
  /** Mostra um campo opcional de DICA de senha (só faz sentido com requireConfirm). */
  withHint?: boolean;
  /** Dica salva no arquivo, exibida ao pedir a senha para ABRIR. */
  hint?: string | null;
};

export type PasswordPromptResult = { password: string; hint: string | null };

let _opener: ((opts: PasswordPromptOpts) => Promise<PasswordPromptResult | null>) | null = null;

export function registerPasswordPrompt(
  fn: (opts: PasswordPromptOpts) => Promise<PasswordPromptResult | null>
) {
  _opener = fn;
}

export function unregisterPasswordPrompt() {
  _opener = null;
}

/** Pede a senha e devolve só a senha (compatível com os usos antigos). */
export function promptPassword(opts: PasswordPromptOpts): Promise<string | null> {
  if (_opener) return _opener(opts).then((r) => r?.password ?? null);
  // Sem componente montado: não há como pedir — cancela.
  return Promise.resolve(null);
}

/** Pede a senha + dica opcional (para definir/proteger). */
export function promptPasswordWithHint(
  opts: PasswordPromptOpts
): Promise<PasswordPromptResult | null> {
  if (_opener) return _opener({ ...opts, withHint: true });
  return Promise.resolve(null);
}
