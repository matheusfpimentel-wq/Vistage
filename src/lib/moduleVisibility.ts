import { useEffect, useState } from "react";
import { persistDocSetting } from "./docSettings";

/**
 * Visibilidade de módulos (Perfil). O usuário pode OCULTAR os módulos do grupo
 * CRIAÇÃO — sem apagar dado: ocultar é um filtro de superfície (menu, "+", busca,
 * alertas/insights, contribuição no Dashboard). Religar restaura tudo intacto.
 *
 * Persistência: `vistage.profile.hiddenModules` em document_settings (portátil —
 * viaja no .vistage, hidratado pro localStorage ao abrir). Leitura é SÍNCRONA
 * (cache do localStorage) pra nav/busca/dashboard filtrarem sem flicker.
 *
 * ID canônico do módulo = a rota (`/gigs`, `/festas`, …), igual em nav/rotas/busca.
 */

export const CRIACAO_MODULE_IDS = [
  "/gigs",
  "/musica",
  "/festas",
  "/aulas",
  "/conteudo",
] as const;
export type CriacaoModuleId = (typeof CRIACAO_MODULE_IDS)[number];

export const MODULE_LABELS: Record<CriacaoModuleId, string> = {
  "/gigs": "GIGs",
  "/musica": "Produção Musical",
  "/festas": "Produção de Festas",
  "/aulas": "Aulas",
  "/conteudo": "Conteúdo",
};

const KEY = "vistage.profile.hiddenModules";
const VIS_EVENT = "vistage:visibility-changed";

/** Conjunto de módulos ocultos (leitura síncrona do cache local). */
export function getHiddenModules(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Um módulo está visível? (Módulos fora de CRIAÇÃO são sempre visíveis.) */
export function isModuleVisible(moduleId: string): boolean {
  return !getHiddenModules().has(moduleId);
}

function persistHidden(hidden: Set<string>): void {
  // só guarda ids de CRIAÇÃO (defensivo — nunca oculta o resto do app)
  const clean = [...hidden].filter((id) => (CRIACAO_MODULE_IDS as readonly string[]).includes(id));
  persistDocSetting(KEY, JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent(VIS_EVENT));
}

/** Liga/desliga um módulo individual. */
export function setModuleHidden(moduleId: CriacaoModuleId, hidden: boolean): void {
  const set = getHiddenModules();
  if (hidden) set.add(moduleId);
  else set.delete(moduleId);
  persistHidden(set);
}

/** Hook reativo: re-renderiza quando a visibilidade muda (toggle/hidratação). */
export function useHiddenModules(): Set<string> {
  const [hidden, setHidden] = useState<Set<string>>(getHiddenModules);
  useEffect(() => {
    const refresh = () => setHidden(getHiddenModules());
    window.addEventListener(VIS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(VIS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return hidden;
}
