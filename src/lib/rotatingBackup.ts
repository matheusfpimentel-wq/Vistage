import { appDataDir } from "@tauri-apps/api/path";
import { copyFile, mkdir, exists, remove } from "@tauri-apps/plugin-fs";

/**
 * Backups rotativos: a cada SAVE bem-sucedido, copia o .vistage final pra uma
 * pasta de backups e mantém só os últimos N. É rede de segurança contra "save
 * corrompido" ou "sobrescrevi por engano" — a diferença entre perder uma noite e
 * perder o negócio. Best-effort: NUNCA atrapalha o save (qualquer erro é engolido).
 *
 * Por que rastrear a lista no localStorage e não listar a pasta: o app não tem
 * permissão de read-dir (capabilities). Guardamos os caminhos criados e podamos
 * por essa lista — sem precisar varrer o diretório.
 */
const LS_ENABLED = "vistage.backup.enabled";
const LS_DIR = "vistage.backup.dir";
const LS_KEEP = "vistage.backup.keep";
const LS_LIST = "vistage.backup.list";
const DEFAULT_KEEP = 10;

function sepOf(p: string): string {
  return p.includes("\\") && !p.includes("/") ? "\\" : "/";
}
function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || "documento.vistage";
}
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function isBackupEnabled(): boolean {
  return localStorage.getItem(LS_ENABLED) !== "0"; // padrão: LIGADO
}
export function setBackupEnabled(on: boolean): void {
  localStorage.setItem(LS_ENABLED, on ? "1" : "0");
}
export function getBackupKeep(): number {
  const n = Number(localStorage.getItem(LS_KEEP));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_KEEP;
}
export function setBackupKeep(n: number): void {
  if (Number.isFinite(n) && n >= 1) localStorage.setItem(LS_KEEP, String(Math.floor(n)));
}
export function getBackupDirOverride(): string | null {
  return localStorage.getItem(LS_DIR);
}
export function setBackupDirOverride(dir: string | null): void {
  if (dir) localStorage.setItem(LS_DIR, dir);
  else localStorage.removeItem(LS_DIR);
}

/** Pasta de destino: a escolhida pelo usuário, ou `appDataDir()/vistage-backups`. */
export async function resolveBackupDir(): Promise<string> {
  const custom = localStorage.getItem(LS_DIR);
  if (custom) return custom.replace(/[\\/]+$/, "");
  const dir = await appDataDir();
  return `${dir.replace(/[\\/]+$/, "")}${sepOf(dir)}vistage-backups`;
}

/**
 * Copia o arquivo recém-salvo pra pasta de backups e poda nos últimos N.
 * Chamar DEPOIS de um save bem-sucedido. Best-effort.
 */
export async function rotateBackup(savedPath: string): Promise<void> {
  if (!isBackupEnabled() || !savedPath) return;
  try {
    const dir = await resolveBackupDir();
    const sep = sepOf(dir);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });

    const base = basename(savedPath).replace(/\.vistage$/i, "");
    const dest = `${dir}${sep}${base}-${stamp()}.vistage`;
    await copyFile(savedPath, dest);

    // Atualiza a lista rastreada e poda os mais antigos.
    let list: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(LS_LIST) || "[]");
      if (Array.isArray(raw)) list = raw.filter((x) => typeof x === "string");
    } catch {
      /* lista corrompida — recomeça */
    }
    list.push(dest);
    const keep = getBackupKeep();
    while (list.length > keep) {
      const old = list.shift();
      if (!old) continue;
      try {
        if (await exists(old)) await remove(old);
      } catch {
        /* arquivo já sumiu / sem permissão — ignora */
      }
    }
    localStorage.setItem(LS_LIST, JSON.stringify(list));
  } catch {
    /* backup é rede de segurança: erro aqui NUNCA quebra o save */
  }
}
