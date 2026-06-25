import { hasAnyDocumentData } from "./backup";

/**
 * Recuperação de crash — SEM arquivo extra. A réplica local (vistage-replica.db)
 * persiste no disco entre sessões; só o "abre em branco" do boot a zera. Então,
 * num crash/queda de energia/kill, os dados NÃO salvos continuam na réplica. Aqui
 * só marcamos "havia trabalho não salvo" (flag em localStorage, gravação síncrona
 * que sobrevive a um crash) e, no próximo boot, se a flag estiver setada E a
 * réplica ainda tiver dados, oferecemos manter em vez de zerar.
 */
const K_UNSAVED = "vistage.recovery.unsavedAt";

/** Marca que há mudança não salva (a cada edição do usuário). */
export function markUnsavedWork(): void {
  try {
    localStorage.setItem(K_UNSAVED, new Date().toISOString());
  } catch {
    /* storage indisponível */
  }
}

/** Limpa a marca (após um save bem-sucedido). */
export function clearUnsavedWork(): void {
  try {
    localStorage.removeItem(K_UNSAVED);
  } catch {
    /* ignora */
  }
}

/** ISO da última mudança não salva, ou null. */
export function unsavedSince(): string | null {
  try {
    return localStorage.getItem(K_UNSAVED);
  } catch {
    return null;
  }
}

/**
 * Há recuperação pendente? = sessão anterior tinha mudança não salva (flag) E a
 * réplica ainda tem dados de documento. Chamado no boot, ANTES do "abre em branco".
 */
export async function peekUnsavedRecovery(): Promise<boolean> {
  if (!unsavedSince()) return false;
  try {
    return await hasAnyDocumentData();
  } catch {
    return false;
  }
}
