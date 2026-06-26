import { create } from "zustand";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  clearDocumentData,
  hasAnyDocumentData,
  pickBackupFile,
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
//
// UM ARQUIVO POR VEZ. Não há abas/multi-tab: abrir um documento substitui o
// que está carregado (o banco SQLite é único). Manter mais de um "aberto" sobre
// o mesmo banco vazava estado entre documentos (tarefa caindo no doc errado,
// etc.), então o modelo é deliberadamente single-document.

const LS_KEY = "vistage.currentDocument";

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
// de dados (abrir documento, popular exemplos): os dados recém-carregados
// devem permanecer em vez de cair no "abre em branco". Ver o boot em App.tsx.
export const SKIP_BLANK_WIPE_KEY = "vistage.skipBlankWipe";

/**
 * Sinaliza ao próximo boot (após abrir um documento) que deve sincronizar TODAS
 * as integrações configuradas — os tokens viajam no .vistage, então abrir o
 * arquivo já reconecta e põe tudo em dia. Lido em App.tsx.
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

// Diálogo imperativo "alterações não salvas" (Salvar / Descartar / Cancelar).
// O componente UnsavedChangesDialog registra o resolver ao montar; Abrir/Novo
// chamam askUnsaved() para OFERECER o salvamento antes de trocar o documento.
export type UnsavedChoice = "save" | "discard" | "cancel";
let _unsavedOpener: (() => Promise<UnsavedChoice>) | null = null;

export function registerUnsavedOpener(fn: () => Promise<UnsavedChoice>) {
  _unsavedOpener = fn;
}
export function unregisterUnsavedOpener() {
  _unsavedOpener = null;
}

/**
 * Pergunta ao usuário o que fazer com as mudanças não salvas. Sem o componente
 * montado, CANCELA por segurança (nunca descarta dados sem perguntar).
 */
function askUnsaved(): Promise<UnsavedChoice> {
  return _unsavedOpener ? _unsavedOpener() : Promise.resolve("cancel");
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
  /** Abre um .vistage pelo diálogo, substituindo o documento atual. */
  open: () => Promise<void>;
  /** Abre um documento NOVO em branco (guarda o atual antes). */
  newDocument: () => Promise<void>;
  /** Salva no arquivo atual; se não houver, cai em "Salvar como". Retorna se salvou. */
  save: () => Promise<boolean>;
  /** Sempre abre o diálogo "Salvar como". Retorna se salvou. */
  saveAs: () => Promise<boolean>;
};

type SetState = (partial: Partial<DocumentState>) => void;
type GetState = () => DocumentState;

/**
 * Antes de Abrir/criar Novo (que substituem o banco), OFERECE salvar as mudanças
 * não salvas do documento atual. Há o que perder quando:
 *  - o doc tem caminho e está sujo, ou
 *  - é um doc sem título com qualquer dado preenchido.
 * Nesses casos, abre o diálogo de 3 opções:
 *  - Salvar   → grava o atual (cai em "Salvar como" se não houver caminho);
 *               se o "Salvar como" for cancelado, a troca é abortada.
 *  - Descartar → segue a troca, perdendo as mudanças.
 *  - Cancelar  → aborta a troca, sem perder nada.
 * Sem nada a perder, segue direto (return true). Devolve false só quando a troca
 * deve ser abortada.
 */
async function guardUnsaved(get: GetState): Promise<boolean> {
  const { currentPath, dirty } = get();
  const hasUnsaved = currentPath
    ? dirty
    : await hasAnyDocumentData().catch(() => false);
  if (!hasUnsaved) return true;

  const choice = await askUnsaved();
  if (choice === "cancel") return false;
  if (choice === "discard") return true;
  // "save": grava o atual. save() recai em saveAs() quando não há caminho; se o
  // usuário cancelar o "Salvar como", abortamos a troca para não perder dados.
  return get().save();
}

/** Carrega um backup já lido como documento ativo e recarrega. */
async function applyOpened(set: SetState, backup: Backup, path: string): Promise<void> {
  sessionStorage.setItem(SYNC_INTEGRATIONS_KEY, "1");
  await restoreBackup(backup);
  await restoreBackupSession(backup);
  localStorage.setItem(LS_KEY, path);
  set({ currentPath: path, currentName: fileName(path), dirty: false });
  toast.success(`Documento aberto: ${fileName(path)}. Recarregando…`);
  setTimeout(() => reloadKeepingData(), 800);
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentPath: localStorage.getItem(LS_KEY),
  currentName: fileName(localStorage.getItem(LS_KEY)),
  busy: false,
  dirty: false,
  bootSettled: false,
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  settleBoot: () => set({ bootSettled: true, dirty: false }),

  open: async () => {
    if (get().busy) return;
    // Abrir é ABRIR: primeiro escolhe o arquivo; só DEPOIS oferece salvar o atual
    // e troca. Cancelar o seletor de arquivo não muda nada. O escolhido SUBSTITUI
    // o documento atual (um arquivo por vez).
    const picked = await pickBackupFile().catch((e) => {
      toast.error(`Erro ao abrir documento: ${String(e)}`);
      return null;
    });
    if (!picked) return;
    if (!(await guardUnsaved(get))) return;
    set({ busy: true });
    try {
      await applyOpened(set, picked.backup, picked.path);
    } catch (e) {
      toast.error(`Erro ao abrir documento: ${String(e)}`);
      set({ busy: false });
    }
  },

  newDocument: async () => {
    if (get().busy) return;
    if (!(await guardUnsaved(get))) return;
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
      set({ currentPath: path, currentName: fileName(path), dirty: false });
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
