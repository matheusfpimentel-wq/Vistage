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
};

let _opener: ((opts: PasswordPromptOpts) => Promise<string | null>) | null = null;

export function registerPasswordPrompt(fn: (opts: PasswordPromptOpts) => Promise<string | null>) {
  _opener = fn;
}

export function unregisterPasswordPrompt() {
  _opener = null;
}

export function promptPassword(opts: PasswordPromptOpts): Promise<string | null> {
  if (_opener) return _opener(opts);
  // Sem componente montado: não há como pedir — cancela.
  return Promise.resolve(null);
}
