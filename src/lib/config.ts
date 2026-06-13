import { create } from "zustand";
import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

// O arquivo de configuração mora ao lado do banco para que o conjunto inteiro
// (config + db + uploads) seja portátil. Mantemos também uma chave em localStorage
// apontando para o último caminho de config usado, para o app encontrar tudo
// novamente depois de fechar.

const LS_KEY = "vistage.lastConfigPath";

export type AppConfig = {
  dbPath: string;            // caminho absoluto do .db
  uploadsDir: string;        // pasta para anexos
  createdAt: string;         // ISO timestamp
  syncedFolder?: boolean;    // true quando o banco mora numa pasta sincronizada (Google Drive, etc.)
};

type ConfigState = {
  ready: boolean;            // true quando temos um config válido carregado
  config: AppConfig | null;
  configPath: string | null;
  errorMessage: string | null;
  hydrate: () => Promise<void>;
  setupNew: (folder: string, syncedFolder?: boolean) => Promise<AppConfig>;
  loadExisting: (configFile: string) => Promise<AppConfig>;
  setSyncedFolder: (value: boolean) => Promise<void>;
  relocateData: (folder: string, syncedFolder: boolean) => Promise<AppConfig>;
  reset: () => void;
};

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/** Copia recursivamente o conteúdo de uma pasta para outra (cria destino). */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  if (!(await exists(dest))) await mkdir(dest, { recursive: true });
  const entries = await readDir(src);
  for (const entry of entries) {
    const from = joinPath(src, entry.name);
    const to = joinPath(dest, entry.name);
    if (entry.isDirectory) {
      await copyDirRecursive(from, to);
    } else {
      await copyFile(from, to);
    }
  }
}

export const useConfigStore = create<ConfigState>((set) => ({
  ready: false,
  config: null,
  configPath: null,
  errorMessage: null,

  async hydrate() {
    const last = localStorage.getItem(LS_KEY);
    if (!last) return;
    try {
      if (await exists(last)) {
        const cfg = JSON.parse(await readTextFile(last)) as AppConfig;
        // Sanity: o .db precisa existir (HD pode estar desconectado).
        if (!(await exists(cfg.dbPath))) {
          set({
            ready: false,
            config: null,
            configPath: last,
            errorMessage:
              "Banco de dados não encontrado no caminho salvo. " +
              "Se está no Google Drive, aguarde a sincronização terminar e tente de novo. " +
              "Se está num HD externo, verifique se está conectado.",
          });
          return;
        }
        set({ ready: true, config: cfg, configPath: last, errorMessage: null });
      }
    } catch (err) {
      set({ errorMessage: String(err) });
    }
  },

  async setupNew(folder: string, syncedFolder = false) {
    // cria pastas e arquivos necessários
    if (!(await exists(folder))) {
      await mkdir(folder, { recursive: true });
    }
    const uploadsDir = joinPath(folder, "uploads");
    if (!(await exists(uploadsDir))) {
      await mkdir(uploadsDir, { recursive: true });
    }
    const dbPath = joinPath(folder, "vistage.db");
    const configPath = joinPath(folder, "vistage.config.json");
    const cfg: AppConfig = {
      dbPath,
      uploadsDir,
      createdAt: new Date().toISOString(),
      syncedFolder,
    };
    await writeTextFile(configPath, JSON.stringify(cfg, null, 2));
    localStorage.setItem(LS_KEY, configPath);
    set({ ready: true, config: cfg, configPath, errorMessage: null });
    return cfg;
  },

  /** Liga/desliga o modo "pasta sincronizada" e reescreve o config.json. */
  async setSyncedFolder(value: boolean) {
    const { config, configPath } = useConfigStore.getState();
    if (!config || !configPath) return;
    const next: AppConfig = { ...config, syncedFolder: value };
    await writeTextFile(configPath, JSON.stringify(next, null, 2));
    set({ config: next });
  },

  /**
   * Copia o banco + anexos + config para `folder` (ex.: pasta do Google Drive)
   * e repassa o app a apontar para lá. O banco deve estar fechado antes de
   * chamar (arquivo travado durante a cópia). Retorna o novo config.
   */
  async relocateData(folder: string, syncedFolder: boolean) {
    const { config } = useConfigStore.getState();
    if (!config) throw new Error("Nenhum banco carregado para mover.");
    if (!(await exists(folder))) {
      await mkdir(folder, { recursive: true });
    }
    const newDbPath = joinPath(folder, "vistage.db");
    const newUploadsDir = joinPath(folder, "uploads");
    const newConfigPath = joinPath(folder, "vistage.config.json");

    // copia o arquivo do banco
    await copyFile(config.dbPath, newDbPath);
    // copia anexos (se houver)
    if (await exists(config.uploadsDir)) {
      await copyDirRecursive(config.uploadsDir, newUploadsDir);
    } else {
      await mkdir(newUploadsDir, { recursive: true });
    }

    const next: AppConfig = {
      dbPath: newDbPath,
      uploadsDir: newUploadsDir,
      createdAt: config.createdAt,
      syncedFolder,
    };
    await writeTextFile(newConfigPath, JSON.stringify(next, null, 2));
    localStorage.setItem(LS_KEY, newConfigPath);
    set({ ready: true, config: next, configPath: newConfigPath, errorMessage: null });
    return next;
  },

  async loadExisting(configFile: string) {
    const cfg = JSON.parse(await readTextFile(configFile)) as AppConfig;
    // Não usa exists() para checar o .db — em pastas do Google Drive/OneDrive
    // (File Provider) o arquivo pode estar visível no Finder mas exists()
    // retorna false até a primeira leitura real materializar o download.
    // Deixamos o SQLite tentar abrir e capturamos o erro se não existir.
    localStorage.setItem(LS_KEY, configFile);
    set({ ready: true, config: cfg, configPath: configFile, errorMessage: null });
    return cfg;
  },

  reset() {
    localStorage.removeItem(LS_KEY);
    set({ ready: false, config: null, configPath: null, errorMessage: null });
  },
}));
