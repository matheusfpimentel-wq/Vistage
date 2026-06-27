import { enqueueCapture } from "./queue";

/**
 * Envia uma captura aditiva pro desktop revisar (fundir/descartar).
 *
 * Agora é OFFLINE-FIRST: grava na fila durável e tenta subir já. Não lança em
 * falha de rede — a captura fica na fila e sobe sozinha depois (online / volta
 * ao app). Quem chama pode tratar como "capturado ✓".
 */
export async function sendCapture(kind: string, payload: Record<string, unknown>): Promise<void> {
  await enqueueCapture(kind, payload);
}
