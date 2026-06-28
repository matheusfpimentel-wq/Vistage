import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { reconcileScanned, type ScanDiff, type ScannedTrack } from "./api";

// Gerenciador SINGLETON da varredura da biblioteca, em nível de MÓDULO (vive fora
// do ciclo de montagem do React). É isto que faz o scan CONTINUAR quando o
// usuário sai da tela Biblioteca: as assinaturas dos eventos do Tauri ficam aqui,
// não no componente. A varredura roda numa task de fundo no Rust
// (`audio_scan_folder_bg`) e reporta progresso/fim por eventos; a tela Músicas só
// LÊ este estado (e reage), em vez de aguardar a varredura ela mesma.
//
// Fluxo: scanning → (evento complete) → reconciling → done (com o diff p/ revisar)
// → applyScan na tela → reset(). `scanId` descarta eventos de varreduras antigas.

type ScanStatus = "idle" | "scanning" | "reconciling" | "done" | "error";

type ProgressPayload = { scan_id: string; scanned: number };
type CompletePayload = { scan_id: string; tracks: ScannedTrack[] };
type ErrorPayload = { scan_id: string; error: string };

type ScanManagerState = {
  status: ScanStatus;
  scanned: number;
  path: string | null;
  diff: ScanDiff | null;
  error: string | null;
  startScan: (path: string, includeSubdirs: boolean) => Promise<void>;
  reset: () => void;
};

// Estado vivo da varredura corrente, fora do store (o store só reflete pro React).
let currentScanId: string | null = null;
// Cancela todas as assinaturas da varredura corrente (chamado ao terminar/errar).
let unlistenAll: (() => void) | null = null;

const IDLE = { status: "idle", scanned: 0, path: null, diff: null, error: null } as const;

async function teardown(): Promise<void> {
  if (unlistenAll) {
    unlistenAll();
    unlistenAll = null;
  }
  currentScanId = null;
}

export const useScanManager = create<ScanManagerState>((set, get) => ({
  ...IDLE,

  async startScan(path, includeSubdirs) {
    // Impede varreduras sobrepostas: se já há uma rodando, ignora.
    if (get().status === "scanning" || get().status === "reconciling") return;

    const scanId = crypto.randomUUID();
    currentScanId = scanId;
    set({ status: "scanning", scanned: 0, path, diff: null, error: null });

    const { listen } = await import("@tauri-apps/api/event");

    // Assina ANTES de invocar, pra não perder eventos de uma pasta pequena que
    // termina quase instantaneamente.
    const unProgress = await listen<ProgressPayload>("library-scan-progress", (e) => {
      if (e.payload.scan_id !== scanId) return; // evento de varredura antiga
      set({ scanned: e.payload.scanned });
    });

    const unComplete = await listen<CompletePayload>("library-scan-complete", (e) => {
      if (e.payload.scan_id !== scanId) return;
      set({ status: "reconciling", scanned: e.payload.tracks.length });
      // A reconciliação (confronto com o banco) roda aqui, no nível do módulo, pra
      // que o resultado seja capturado mesmo se a tela Músicas estiver desmontada.
      reconcileScanned(e.payload.tracks, path)
        .then((diff) => {
          if (currentScanId !== scanId) return; // já foi resetada/substituída
          set({ status: "done", diff });
        })
        .catch((err) => {
          if (currentScanId !== scanId) return;
          set({ status: "error", error: String(err) });
        })
        .finally(() => {
          void teardown();
        });
    });

    const unError = await listen<ErrorPayload>("library-scan-error", (e) => {
      if (e.payload.scan_id !== scanId) return;
      set({ status: "error", error: e.payload.error });
      void teardown();
    });

    unlistenAll = () => {
      unProgress();
      unComplete();
      unError();
    };

    try {
      await invoke("audio_scan_folder_bg", { scanId, path, includeSubdirs });
    } catch (err) {
      // Falha já ao INICIAR a task de fundo (não chega a emitir o evento de erro).
      if (currentScanId === scanId) {
        set({ status: "error", error: String(err) });
        void teardown();
      }
    }
  },

  reset() {
    void teardown();
    set({ ...IDLE });
  },
}));
