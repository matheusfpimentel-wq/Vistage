import type { jsPDF } from "jspdf";

/**
 * Salva um documento jsPDF de forma CONFIÁVEL no app desktop (Tauri).
 *
 * O `doc.save()` do jsPDF faz um "download" via <a download> da webview — no
 * Tauri isso costuma cair num lugar invisível (ou nada acontece), então o botão
 * parece "não funcionar". Aqui abrimos o diálogo nativo "Salvar como…" e
 * gravamos os bytes do PDF no caminho escolhido. Fora do Tauri (preview/web),
 * cai no download do navegador.
 *
 * Retorna false se o usuário cancelar o diálogo.
 */
export async function savePdfDoc(doc: jsPDF, suggestedName: string): Promise<boolean> {
  const name = suggestedName.toLowerCase().endsWith(".pdf") ? suggestedName : `${suggestedName}.pdf`;
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    const [{ save: saveDialog }, { writeFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await saveDialog({
      title: "Salvar PDF como…",
      defaultPath: name,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path) return false; // cancelado
    const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
    await writeFile(path, bytes);
    return true;
  }
  doc.save(name);
  return true;
}
