import { create } from "zustand";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

// O arquivo de configuração mora ao lado da pasta de anexos para que o conjunto
// (config + uploads) seja portátil. Guardamos em localStorage o último caminho
// de config usado, para o app reencontrar tudo depois de fechar. O banco ativo
// (libsql) vive no diretório de dados do app (AppData), não nesta pasta.

const LS_KEY = "vistage.lastConfigPath";

export type AppConfig = {
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
  patchConfig: (patch: Partial<AppConfig>) => Promise<void>;
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
        set({ ready: true, config: cfg, configPath: last, errorMessage: null });
      }
    } catch (err) {
      set({ errorMessage: String(err) });
    }
  },

  async setupNew(folder: string) {
    // cria a pasta de anexos e o arquivo de config dentro da pasta escolhida
    if (!(await exists(folder))) {
      await mkdir(folder, { recursive: true });
    }
    const uploadsDir = joinPath(folder, "uploads");
    if (!(await exists(uploadsDir))) {
      await mkdir(uploadsDir, { recursive: true });
    }
    const configPath = joinPath(folder, "vistage.config.json");
    const cfg: AppConfig = {
      uploadsDir,
      createdAt: new Date().toISOString(),
    };
    await writeTextFile(configPath, JSON.stringify(cfg, null, 2));
    localStorage.setItem(LS_KEY, configPath);
    set({ ready: true, config: cfg, configPath, errorMessage: null });
    return cfg;
  },

  /** Aplica um patch parcial ao config e persiste no disco. */
  async patchConfig(patch: Partial<AppConfig>) {
    const { config, configPath } = useConfigStore.getState();
    if (!config || !configPath) return;
    const next: AppConfig = { ...config, ...patch };
    await writeTextFile(configPath, JSON.stringify(next, null, 2));
    set({ config: next });
  },

  async loadExisting(configFile: string) {
    const cfg = JSON.parse(await readTextFile(configFile)) as AppConfig;
    localStorage.setItem(LS_KEY, configFile);
    set({ ready: true, config: cfg, configPath: configFile, errorMessage: null });
    return cfg;
  },

  reset() {
    localStorage.removeItem(LS_KEY);
    set({ ready: false, config: null, configPath: null, errorMessage: null });
  },
}));
