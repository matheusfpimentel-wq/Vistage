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

/** Presets de perfil: ligam/desligam um conjunto dos módulos de CRIAÇÃO de uma vez. */
export const PROFILE_PRESETS: { id: string; label: string; hidden: CriacaoModuleId[] }[] = [
  { id: "tudo", label: "Tudo", hidden: [] },
  { id: "so-toco", label: "Só toco", hidden: ["/musica", "/festas", "/aulas"] },
  { id: "toco-produzo", label: "Toco e produzo", hidden: ["/festas", "/aulas"] },
  { id: "toco-aula", label: "Toco e dou aula", hidden: ["/musica", "/festas"] },
  { id: "so-produzo", label: "Só produzo", hidden: ["/gigs", "/festas", "/aulas"] },
];

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

/** Aplica um preset (substitui o conjunto oculto). */
export function applyProfilePreset(presetId: string): void {
  const preset = PROFILE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  persistHidden(new Set(preset.hidden));
}

/** Qual preset corresponde ao conjunto oculto atual (ou null se for custom). */
export function matchPreset(hidden: Set<string>): string | null {
  for (const p of PROFILE_PRESETS) {
    if (p.hidden.length === hidden.size && p.hidden.every((id) => hidden.has(id))) return p.id;
  }
  return null;
}

/** Hook reativo: re-renderiza quando a visibilidade muda (toggle/preset/hidratação). */
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
