import { create } from "zustand";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

// O arquivo de configuração mora ao lado do banco para que o conjunto inteiro
// (config + db + uploads) seja portátil. Mantemos também uma chave em localStorage
// apontando para o último caminho de config usado, para o app encontrar tudo
// novamente depois de fechar.

const LS_KEY = "musicgest.lastConfigPath";

export type AppConfig = {
  dbPath: string;            // caminho absoluto do .db
  uploadsDir: string;        // pasta para anexos
  createdAt: string;         // ISO timestamp
};

type ConfigState = {
  ready: boolean;            // true quando temos um config válido carregado
  config: AppConfig | null;
  configPath: string | null;
  errorMessage: string | null;
  hydrate: () => Promise<void>;
  setupNew: (folder: string) => Promise<AppConfig>;
  loadExisting: (configFile: string) => Promise<AppConfig>;
  reset: () => void;
};

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
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
              "Banco de dados não encontrado no caminho salvo. O HD externo pode estar desconectado.",
          });
          return;
        }
        set({ ready: true, config: cfg, configPath: last, errorMessage: null });
      }
    } catch (err) {
      set({ errorMessage: String(err) });
    }
  },

  async setupNew(folder: string) {
    // cria pastas e arquivos necessários
    if (!(await exists(folder))) {
      await mkdir(folder, { recursive: true });
    }
    const uploadsDir = joinPath(folder, "uploads");
    if (!(await exists(uploadsDir))) {
      await mkdir(uploadsDir, { recursive: true });
    }
    const dbPath = joinPath(folder, "musicgest.db");
    const configPath = joinPath(folder, "musicgest.config.json");
    const cfg: AppConfig = {
      dbPath,
      uploadsDir,
      createdAt: new Date().toISOString(),
    };
    await writeTextFile(configPath, JSON.stringify(cfg, null, 2));
    localStorage.setItem(LS_KEY, configPath);
    set({ ready: true, config: cfg, configPath, errorMessage: null });
    return cfg;
  },

  async loadExisting(configFile: string) {
    const cfg = JSON.parse(await readTextFile(configFile)) as AppConfig;
    if (!(await exists(cfg.dbPath))) {
      throw new Error(`O banco de dados em ${cfg.dbPath} não foi encontrado.`);
    }
    localStorage.setItem(LS_KEY, configFile);
    set({ ready: true, config: cfg, configPath: configFile, errorMessage: null });
    return cfg;
  },

  reset() {
    localStorage.removeItem(LS_KEY);
    set({ ready: false, config: null, configPath: null, errorMessage: null });
  },
}));
