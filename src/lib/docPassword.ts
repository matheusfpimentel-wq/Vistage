import { create } from "zustand";

/**
 * Senha do documento aberto, mantida APENAS em memória/sessão (nunca em disco).
 * Usada pra re-cifrar nos "Salvar" seguintes sem perguntar de novo. Como abrir
 * um .vistage recarrega a página, guardamos em sessionStorage (sobrevive ao
 * reload, mas não ao relançamento do app — aí a senha é pedida de novo ao abrir).
 */
const SS_KEY = "vistage.docPassword";

type DocPasswordState = {
  password: string | null;
  setPassword: (p: string | null) => void;
};

export const useDocPassword = create<DocPasswordState>((set) => ({
  password: (() => {
    try {
      return sessionStorage.getItem(SS_KEY);
    } catch {
      return null;
    }
  })(),
  setPassword: (p) => {
    try {
      if (p) sessionStorage.setItem(SS_KEY, p);
      else sessionStorage.removeItem(SS_KEY);
    } catch {
      /* ignora */
    }
    set({ password: p });
  },
}));

/** Acesso imperativo (fora de componentes React). */
export function getDocPassword(): string | null {
  return useDocPassword.getState().password;
}

export function setDocPassword(p: string | null): void {
  useDocPassword.getState().setPassword(p);
}
