import { create } from "zustand";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  buildBackup,
  pickBackupFile,
  restoreBackup,
  saveBackupToPath,
  type Backup,
} from "./backup";
import { getDb } from "./db";
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
}

type DocumentState = {
  currentPath: string | null;
  currentName: string | null;
  busy: boolean;
  /** Abre um .vistage (diálogo), pergunta Mesclar/Sobrescrever/Cancelar antes de agir. */
  open: () => Promise<void>;
  /** Salva no arquivo atual; se não houver, cai em "Salvar como". */
  save: () => Promise<void>;
  /** Sempre abre o diálogo "Salvar como". */
  saveAs: () => Promise<void>;
};

export const useDocumentStore = create<DocumentState>((set, get) => ({
  currentPath: localStorage.getItem(LS_KEY),
  currentName: fileName(localStorage.getItem(LS_KEY)),
  busy: false,

  open: async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const picked = await pickBackupFile();
      if (!picked) return;

      // Pergunta ao usuário como abrir ANTES de modificar qualquer dado
      const mode = await askOpenMode();
      if (mode === "cancel") return;

      if (mode === "merge") {
        await mergeBackup(picked.backup);
        localStorage.setItem(LS_KEY, picked.path);
        set({ currentPath: picked.path, currentName: fileName(picked.path) });
        toast.success(`Documento mesclado: ${fileName(picked.path)}. Recarregando…`);
        setTimeout(() => window.location.reload(), 800);
      } else {
        // overwrite
        await restoreBackup(picked.backup);
        localStorage.setItem(LS_KEY, picked.path);
        set({ currentPath: picked.path, currentName: fileName(picked.path) });
        toast.success(`Documento aberto: ${fileName(picked.path)}. Recarregando…`);
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (e) {
      toast.error(`Erro ao abrir documento: ${String(e)}`);
    } finally {
      set({ busy: false });
    }
  },

  save: async () => {
    if (get().busy) return;
    const path = get().currentPath;
    if (!path) {
      await get().saveAs();
      return;
    }
    set({ busy: true });
    try {
      await saveBackupToPath(path);
      toast.success(`Salvo em ${fileName(path)}`);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      set({ busy: false });
    }
  },

  saveAs: async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await saveDialog({
        title: "Salvar documento do Vistage como…",
        defaultPath: get().currentName ?? `Vistage ${stamp}.vistage`,
        filters: [{ name: "Documento Vistage", extensions: ["vistage"] }],
      });
      if (!path) return;
      const backup = await buildBackup();
      await writeTextFile(path, JSON.stringify(backup, null, 2));
      localStorage.setItem(LS_KEY, path);
      set({ currentPath: path, currentName: fileName(path) });
      toast.success(`Salvo como ${fileName(path)}`);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      set({ busy: false });
    }
  },
}));
