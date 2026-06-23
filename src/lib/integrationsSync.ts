import { toast } from "@/components/ui/toaster";

/**
 * Sincroniza TODAS as integrações configuradas de uma vez — Google Calendar,
 * Todoist e o espelho do celular (Supabase). Best-effort: cada uma roda em
 * try/catch própria, então uma falha não derruba as outras.
 *
 * Chamado ao ABRIR um .vistage: como os tokens das integrações viajam dentro do
 * arquivo (portabilidade), abrir o documento — até numa máquina nova — reconecta
 * e já põe tudo em dia automaticamente.
 */
let inFlight: Promise<void> | null = null;

export async function syncAllIntegrations(opts?: { silent?: boolean }): Promise<void> {
  // Re-entrância: salvamentos em sequência (ou boot + save juntos) compartilham
  // o MESMO sync em andamento, em vez de disparar vários concorrentes.
  if (inFlight) return inFlight;
  inFlight = (async () => {
  const done: string[] = [];

  // ── Todoist ────────────────────────────────────────────────────────────────
  try {
    const { getTodoistConfig, syncTodoist } = await import("./todoist");
    const { token, projectId } = await getTodoistConfig();
    if (token && projectId) {
      await syncTodoist();
      done.push("Todoist");
    }
  } catch {
    /* best-effort */
  }

  // ── Google Calendar ──────────────────────────────────────────────────────────
  try {
    const { loadAuth, syncAll } = await import("./gcal");
    const auth = await loadAuth();
    if (auth?.refresh_token || auth?.access_token) {
      await syncAll(); // resolve o calendário por dentro (lança se não houver — caught)
      done.push("Google Calendar");
    }
  } catch {
    /* best-effort (ex.: sem calendário selecionado) */
  }

  // ── Celular (Supabase) ───────────────────────────────────────────────────────
  try {
    const { currentSession } = await import("./supabase");
    if (await currentSession()) {
      const { syncNow } = await import("./mobileSync");
      await syncNow();
      done.push("celular");
    }
  } catch {
    /* best-effort */
  }

  if (!opts?.silent && done.length > 0) {
    toast.success(`Integrações sincronizadas: ${done.join(", ")}.`);
  }
  })();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
