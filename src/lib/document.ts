import { create } from "zustand";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { appDataDir } from "@tauri-apps/api/path";
import {
  clearDocumentData,
  hasAnyDocumentData,
  pickBackupFile,
  readMaybeEncrypted,
  restoreBackup,
  restoreBackupSession,
  saveBackupToPath,
  type Backup,
} from "./backup";
import { rotateBackup } from "./rotatingBackup";
import { clearUnsavedWork } from "./recovery";
import { toast } from "@/components/ui/toaster";

// "Documento" no estilo Office: um arquivo .vistage que contém TODOS os dados
// preenchidos + imagens/arquivos (roteiros, manual de marca, etc.) em um único
// arquivo local e portátil. O usuário pode Abrir, Salvar e "Salvar como" — e o
// caminho atual é lembrado para o "Salvar" gravar por cima sem perguntar.

const LS_KEY = "vistage.currentDocument";
// Abas abertas (multi-tab): lista de caminhos .vistage. Só UM banco carrega por
// vez — trocar de aba salva o atual e carrega o da aba (com reload). Caminhos,
// não dados; um documento em branco (sem caminho) não vira aba.
const LS_TABS = "vistage.openTabs";

function loadTabs(): string[] {
  try {
    const raw = localStorage.getItem(LS_TABS);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function saveTabs(tabs: string[]): void {
  try {
    localStorage.setItem(LS_TABS, JSON.stringify(tabs));
  } catch {
    /* ignora cota */
  }
}

function fileName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || null;
}

/** Nome do documento para exibição — sem a extensão .vistage. */
export function displayDocName(name: string | null): string | null {
  return name ? name.replace(/\.vistage$/i, "") : null;
}

// Chave de sessão (sobrevive ao reload, não ao relançamento do app) que avisa
// o próximo boot para NÃO zerar o banco. Usada quando o reload vem de uma troca
// de dados (abrir/mesclar documento, popular exemplos): os dados recém-carregados
// devem permanecer em vez de cair no "abre em branco". Ver o boot em App.tsx.
export const SKIP_BLANK_WIPE_KEY = "vistage.skipBlankWipe";

/**
 * Sinaliza ao próximo boot (após abrir/mesclar um documento) que deve
 * sincronizar TODAS as integrações configuradas — os tokens viajam no .vistage,
 * então abrir o arquivo já reconecta e põe tudo em dia. Lido em App.tsx.
 */
export const SYNC_INTEGRATIONS_KEY = "vistage.syncIntegrationsOnBoot";

/** Recarrega a página preservando os dados (não dispara o "abre em branco"). */
export function reloadKeepingData(): void {
  sessionStorage.setItem(SKIP_BLANK_WIPE_KEY, "1");
  window.location.reload();
}

// "Reabrir último documento ao iniciar" — opt-in (padrão DESLIGADO). O caminho
// do último .vistage já fica em LS_KEY; o boot, se ligado, recarrega-o em vez de
// abrir em branco. Arquivo com senha não reabre sozinho (precisa do prompt).
const LS_REOPEN = "vistage.reopenLast";
export function isReopenLastEnabled(): boolean {
  return localStorage.getItem(LS_REOPEN) === "1";
}
export function setReopenLast(on: boolean): void {
  localStorage.setItem(LS_REOPEN, on ? "1" : "0");
}

type DocumentState = {
  currentPath: string | null;
  currentName: string | null;
  busy: boolean;
  /** true quando há mudanças não salvas no documento aberto (ou no não-salvo). */
  dirty: boolean;
  /**
   * Vira true quando as escritas automáticas de inicialização terminam. Antes
   * disso, mudanças de dados NÃO contam como "sujo" — o boot gera recorrências,
   * sincroniza vínculos e cria follow-ups, e nada disso é edição do usuário.
   * Sem esse portão, o app abriria sempre "sujo" e travaria o botão de fechar.
   */
  bootSettled: boolean;
  markDirty: () => void;
  markClean: () => void;
  /** Marca o fim do boot: o documento está limpo e mudanças passam a contar. */
  settleBoot: () => void;
  /** Caminhos abertos como abas (multi-tab). */
  tabs: string[];
  /** Abre um .vistage pelo diálogo e o adota como aba ativa (sem perguntar mesclar/sobrescrever). */
  open: () => Promise<void>;
  /** Troca pra aba de um caminho já conhecido (salva o atual antes; recarrega). */
  switchToTab: (path: string) => Promise<void>;
  /** Fecha uma aba (não apaga o arquivo). Se for a ativa, vai pra outra ou pro branco. */
  closeTab: (path: string) => Promise<void>;
  /** Abre um documento NOVO em branco (salva o atual antes). */
  newDocument: () => Promise<void>;
  /** Salva no arquivo atual; se não houver, cai em "Salvar como". Retorna se salvou. */
  save: () => Promise<boolean>;
  /** Sempre abre o diálogo "Salvar como". Retorna se salvou. */
  saveAs: () => Promise<boolean>;
};

type SetState = (partial: Partial<DocumentState>) => void;
type GetState = () => DocumentState;

function addTab(tabs: string[], path: string): string[] {
  return tabs.includes(path) ? tabs : [...tabs, path];
}

/**
 * Guarda o documento SEM TÍTULO atual (que tem dados) num .vistage de segurança
 * na pasta de dados do app e o adota como ABA — assim "Abrir"/"Novo" nunca
 * descartam o que estava na tela, e o trabalho sem título vira uma aba à qual
 * dá pra voltar (multi-tab de verdade). NÃO abre diálogo: é automático e
 * silencioso (só um aviso). Devolve false se a escrita falhar — aí a troca deve
 * ser abortada para não perder dados.
 */
async function snapshotUntitled(set: SetState, get: GetState): Promise<boolean> {
  try {
    const dir = (await appDataDir()).replace(/[\\/]+$/, "");
    const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const path = `${dir}${sep}Sem título ${stamp}.vistage`;
    await saveBackupToPath(path);
    const tabs = addTab(get().tabs, path);
    saveTabs(tabs);
    set({ tabs });
    clearUnsavedWork(); // os dados sem título estão agora salvos no arquivo de segurança
    toast.info(`Documento sem título guardado na aba "${displayDocName(fileName(path))}".`);
    return true;
  } catch (e) {
    toast.error(`Não consegui guardar o documento atual, então não troquei (nada se perdeu): ${String(e)}`);
    return false;
  }
}

/**
 * Garante que o documento ATUAL não se perca antes de trocar/criar:
 *  - tem caminho e está sujo → salva por cima (silencioso).
 *  - sem caminho mas com dados (doc novo) → guarda automático numa aba (snapshotUntitled).
 *  - em branco/limpo → nada a fazer.
 * Devolve false só se o guard-rail falhar (a troca deve ser abortada). NUNCA
 * abre "Salvar como" aqui — Abrir é Abrir, Novo é Novo.
 */
async function ensureCurrentSaved(set: SetState, get: GetState): Promise<boolean> {
  const { currentPath, dirty } = get();
  if (currentPath) return dirty ? get().save() : true;
  const hasData = await hasAnyDocumentData().catch(() => false);
  if (!hasData) return true;
  return snapshotUntitled(set, get);
}

/** Carrega um backup já lido como documento ativo, vira aba e recarrega. */
async function applyOpened(set: SetState, get: GetState, backup: Backup, path: string): Promise<void> {
  sessionStorage.setItem(SYNC_INTEGRATIONS_KEY, "1");
  await restoreBackup(backup);
  await restoreBackupSession(backup);
  localStorage.setItem(LS_KEY, path);
  const tabs = addTab(get().tabs, path);
  saveTabs(tabs);
  set({ currentPath: path, currentName: fileName(path), tabs, dirty: false });
  toast.success(`Documento aberto: ${fileName(path)}. Recarregando…`);
  setTimeout(() => reloadKeepingData(), 800);
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentPath: localStorage.getItem(LS_KEY),
  currentName: fileName(localStorage.getItem(LS_KEY)),
  tabs: (() => {
    const t = loadTabs();
    const cur = localStorage.getItem(LS_KEY);
    if (cur && !t.includes(cur)) {
      t.unshift(cur);
      saveTabs(t);
    }
    return t;
  })(),
  busy: false,
  dirty: false,
  bootSettled: false,
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  settleBoot: () => set({ bootSettled: true, dirty: false }),

  open: async () => {
    if (get().busy) return;
    // Abrir é ABRIR: primeiro escolhe o arquivo; só DEPOIS guarda o atual e troca.
    // Se cancelar o diálogo, nada muda (não cria aba de segurança à toa). O escolhido
    // vira a nova aba ativa — cada arquivo é independente, nada se mistura nem se perde.
    const picked = await pickBackupFile().catch((e) => {
      toast.error(`Erro ao abrir documento: ${String(e)}`);
      return null;
    });
    if (!picked) return;
    if (!(await ensureCurrentSaved(set, get))) return;
    set({ busy: true });
    try {
      await applyOpened(set, get, picked.backup, picked.path);
    } catch (e) {
      toast.error(`Erro ao abrir documento: ${String(e)}`);
      set({ busy: false });
    }
  },

  switchToTab: async (path) => {
    if (get().busy || path === get().currentPath) return;
    // Lê a aba-alvo (pode pedir senha) ANTES de guardar/trocar o atual. Cancelou a
    // senha → nada muda. Só então guarda o atual (snapshot se sem título) e troca.
    const backup = await readMaybeEncrypted(path).catch((e) => {
      toast.error(`Erro ao abrir a aba: ${String(e)}`);
      return null;
    });
    if (!backup) return; // cancelou a senha ou falhou ao ler
    if (!(await ensureCurrentSaved(set, get))) return;
    set({ busy: true });
    try {
      await applyOpened(set, get, backup, path);
    } catch (e) {
      toast.error(`Erro ao abrir a aba: ${String(e)}`);
      set({ busy: false });
    }
  },

  closeTab: async (path) => {
    const tabs = get().tabs.filter((t) => t !== path);
    saveTabs(tabs);
    set({ tabs });
    if (path === get().currentPath) {
      if (tabs.length > 0) await get().switchToTab(tabs[tabs.length - 1]);
      else await get().newDocument();
    }
  },

  newDocument: async () => {
    if (get().busy) return;
    if (!(await ensureCurrentSaved(set, get))) return;
    set({ busy: true });
    try {
      await clearDocumentData();
      localStorage.removeItem(LS_KEY);
      set({ currentPath: null, currentName: null, dirty: false });
      toast.success("Novo documento em branco. Recarregando…");
      setTimeout(() => reloadKeepingData(), 600);
    } catch (e) {
      toast.error(`Erro ao criar documento: ${String(e)}`);
    } finally {
      set({ busy: false });
    }
  },

  save: async () => {
    if (get().busy) return false;
    const path = get().currentPath;
    if (!path) return get().saveAs();
    set({ busy: true });
    try {
      const { skipped } = await saveBackupToPath(path);
      set({ dirty: false });
      clearUnsavedWork(); // salvou no .vistage → nada a recuperar
      // Backup rotativo (rede de segurança) — best-effort, não bloqueia.
      void rotateBackup(path);
      if (skipped.length > 0) {
        toast.warning(
          `Salvo em ${fileName(path)} — mas ${skipped.length} anexo(s) não puderam ser lidos e ficaram de fora do arquivo. Confira se ainda existem na pasta de uploads.`
        );
      } else {
        toast.success(`Salvo em ${fileName(path)}`);
      }
      // A cada salvamento, sincroniza as integrações em segundo plano (silencioso)
      // — Google Calendar, Todoist e o espelho do celular ficam em dia sem clique.
      void import("@/lib/integrationsSync").then(({ syncAllIntegrations }) =>
        syncAllIntegrations({ silent: true })
      );
      return true;
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
      return false;
    } finally {
      set({ busy: false });
    }
  },

  saveAs: async () => {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await saveDialog({
        title: "Salvar documento do Vistage como…",
        defaultPath: get().currentName ?? `Vistage ${stamp}.vistage`,
        filters: [{ name: "Documento Vistage", extensions: ["vistage"] }],
      });
      if (!path) return false;
      const { skipped } = await saveBackupToPath(path);
      localStorage.setItem(LS_KEY, path);
      // Salvar como cria/abre um arquivo de verdade → vira aba (multi-tab).
      const tabs = addTab(get().tabs, path);
      saveTabs(tabs);
      set({ currentPath: path, currentName: fileName(path), tabs, dirty: false });
      clearUnsavedWork();
      void rotateBackup(path);
      if (skipped.length > 0) {
        toast.warning(
          `Salvo como ${fileName(path)} — ${skipped.length} anexo(s) não puderam ser lidos e ficaram de fora.`
        );
      } else {
        toast.success(`Salvo como ${fileName(path)}`);
      }
      void import("@/lib/integrationsSync").then(({ syncAllIntegrations }) =>
        syncAllIntegrations({ silent: true })
      );
      return true;
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));
