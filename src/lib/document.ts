import { create } from "zustand";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  hasAnyDocumentData,
  pickBackupFile,
  restoreBackup,
  restoreBackupFiles,
  restoreBackupSession,
  saveBackupToPath,
  type Backup,
} from "./backup";
import { getDb } from "./db";
import { rotateBackup } from "./rotatingBackup";
import { clearUnsavedWork } from "./recovery";
import { toast } from "@/components/ui/toaster";

// "Documento" no estilo Office: um arquivo .vistage que contém TODOS os dados
// preenchidos + imagens/arquivos (roteiros, manual de marca, etc.) em um único
// arquivo local e portátil. O usuário pode Abrir, Salvar e "Salvar como" — e o
// caminho atual é lembrado para o "Salvar" gravar por cima sem perguntar.

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

// Resolução imperativa de diálogo de 3 opções (Mesclar / Sobrescrever / Cancelar).
// O componente OpenDocumentDialog registra o resolver ao montar.
export type OpenMode = "merge" | "overwrite" | "cancel";
let _openModeOpener: (() => Promise<OpenMode>) | null = null;

export function registerOpenModeOpener(fn: () => Promise<OpenMode>) {
  _openModeOpener = fn;
}
export function unregisterOpenModeOpener() {
  _openModeOpener = null;
}

function askOpenMode(): Promise<OpenMode> {
  if (_openModeOpener) return _openModeOpener();
  // Fallback sem componente montado: sobrescreve (comportamento legado)
  return Promise.resolve("overwrite");
}

/**
 * Mescla os dados do backup no banco local usando INSERT OR IGNORE.
 * Registros existentes (mesmo id) são preservados; só novos são adicionados.
 */
async function mergeBackup(backup: Backup): Promise<void> {
  const db = getDb();
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!rows || !Array.isArray(rows) || rows.length === 0) continue;
    let existingCols: Set<string>;
    try {
      const info = await db.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
      existingCols = new Set(info.map((r) => r.name));
    } catch {
      continue; // tabela não existe nesta versão
    }
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => existingCols.has(c));
      if (cols.length === 0) continue;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const values = cols.map((c) => row[c]);
      try {
        await db.execute(
          `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
          values
        );
      } catch {
        // ignora erros de row individual
      }
    }
  }
  // Restaura também os anexos embutidos (imagens, PDFs) no uploadsDir atual.
  await restoreBackupFiles(backup);
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
  /** Abre um .vistage (diálogo), pergunta Mesclar/Sobrescrever/Cancelar antes de agir. */
  open: () => Promise<void>;
  /** Salva no arquivo atual; se não houver, cai em "Salvar como". Retorna se salvou. */
  save: () => Promise<boolean>;
  /** Sempre abre o diálogo "Salvar como". Retorna se salvou. */
  saveAs: () => Promise<boolean>;
};

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
    set({ busy: true });
    try {
      const picked = await pickBackupFile();
      if (!picked) return;

      // App em branco → não há o que mesclar ou sobrescrever: abre direto.
      // Só pergunta Mesclar/Sobrescrever quando já existem dados a preservar.
      const hasData = await hasAnyDocumentData().catch(() => true);
      const mode: OpenMode = hasData ? await askOpenMode() : "overwrite";
      if (mode === "cancel") return;

      // Abrir um documento → sincroniza as integrações no próximo boot.
      sessionStorage.setItem(SYNC_INTEGRATIONS_KEY, "1");
      if (mode === "merge") {
        await mergeBackup(picked.backup);
        // Reconecta o usuário de sincronização que veio no arquivo (se houver).
        // Persiste na sessão do webview e sobrevive ao reload abaixo.
        await restoreBackupSession(picked.backup);
        localStorage.setItem(LS_KEY, picked.path);
        set({ currentPath: picked.path, currentName: fileName(picked.path), dirty: false });
        toast.success(`Documento mesclado: ${fileName(picked.path)}. Recarregando…`);
        setTimeout(() => reloadKeepingData(), 800);
      } else {
        // overwrite
        await restoreBackup(picked.backup);
        await restoreBackupSession(picked.backup);
        localStorage.setItem(LS_KEY, picked.path);
        set({ currentPath: picked.path, currentName: fileName(picked.path), dirty: false });
        toast.success(`Documento aberto: ${fileName(picked.path)}. Recarregando…`);
        setTimeout(() => reloadKeepingData(), 800);
      }
    } catch (e) {
      toast.error(`Erro ao abrir documento: ${String(e)}`);
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
