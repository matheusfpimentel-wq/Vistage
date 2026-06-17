import { create } from "zustand";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  buildBackup,
  pickBackupFile,
  restoreBackup,
  saveBackupToPath,
} from "./backup";
import { toast } from "@/components/ui/toaster";

// "Documento" no estilo Office: um arquivo .vistage que contém TODOS os dados
// preenchidos + imagens/arquivos (roteiros, manual de marca, etc.) em um único
// arquivo portátil. Independe do salvamento em nuvem (Turso). O usuário pode
// Abrir, Salvar e "Salvar como" — e o caminho atual é lembrado para o "Salvar"
// gravar por cima sem perguntar.

const LS_KEY = "vistage.currentDocument";

function fileName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || null;
}

type DocumentState = {
  currentPath: string | null;
  currentName: string | null;
  busy: boolean;
  /** Abre um .vistage (diálogo) e restaura todos os dados. Destrutivo. */
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
      await restoreBackup(picked.backup);
      localStorage.setItem(LS_KEY, picked.path);
      set({ currentPath: picked.path, currentName: fileName(picked.path) });
      toast.success(`Documento aberto: ${fileName(picked.path)}. Recarregando…`);
      setTimeout(() => window.location.reload(), 800);
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
