import { create } from "zustand";

/**
 * Senha do documento aberto, mantida APENAS em memória/sessão (nunca em disco).
 * Usada pra re-cifrar nos "Salvar" seguintes sem perguntar de novo. Como abrir
 * um .vistage recarrega a página, guardamos em sessionStorage (sobrevive ao
 * reload, mas não ao relançamento do app — aí a senha é pedida de novo ao abrir).
 */
const SS_KEY = "vistage.docPassword";
const SS_HINT_KEY = "vistage.docPasswordHint";

type DocPasswordState = {
  password: string | null;
  /** Dica de senha do documento (texto puro; viaja no arquivo, não é secreta). */
  hint: string | null;
  setPassword: (p: string | null, hint?: string | null) => void;
};

export const useDocPassword = create<DocPasswordState>((set) => ({
  password: (() => {
    try {
      return sessionStorage.getItem(SS_KEY);
    } catch {
      return null;
    }
  })(),
  hint: (() => {
    try {
      return sessionStorage.getItem(SS_HINT_KEY);
    } catch {
      return null;
    }
  })(),
  setPassword: (p, hint = null) => {
    try {
      if (p) sessionStorage.setItem(SS_KEY, p);
      else sessionStorage.removeItem(SS_KEY);
      // A dica só faz sentido com senha — sem senha, limpa também.
      if (p && hint) sessionStorage.setItem(SS_HINT_KEY, hint);
      else sessionStorage.removeItem(SS_HINT_KEY);
    } catch {
      /* ignora */
    }
    set({ password: p, hint: p ? hint : null });
  },
}));

/** Acesso imperativo (fora de componentes React). */
export function getDocPassword(): string | null {
  return useDocPassword.getState().password;
}

export function getDocPasswordHint(): string | null {
  return useDocPassword.getState().hint;
}

export function setDocPassword(p: string | null, hint?: string | null): void {
  useDocPassword.getState().setPassword(p, hint);
}
