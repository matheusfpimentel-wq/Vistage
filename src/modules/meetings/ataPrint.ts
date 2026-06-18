import { toast } from "@/components/ui/toaster";

export type AtaData = {
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  participants: string[];
  /** Ata — texto completo. */
  notes: string | null;
  /** Encaminhamentos / decisões. */
  outcomes: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** YYYY-MM-DD → DD/MM/YYYY (sem fuso, é só string). */
function formatDateBR(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

/**
 * Abre uma janela com a ata formatada e dispara a impressão. Mesma abordagem
 * usada na exportação de cenas do Conteúdo (window.open + print).
 */
export function printAta(data: AtaData): void {
  const headerBits = [formatDateBR(data.date), data.time, data.location]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .map(escapeHtml)
    .join(" · ");
  const participants = data.participants.length
    ? `<p class="meta"><strong>Participantes:</strong> ${escapeHtml(data.participants.join(", "))}</p>`
    : "";
  const section = (label: string, body: string | null) =>
    `<div class="section-label">${label}</div>` +
    (body && body.trim()
      ? `<p class="body">${escapeHtml(body)}</p>`
      : `<p class="body empty">—</p>`);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Ata — ${escapeHtml(data.title || "Reunião")}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#111}
  h1{font-size:1.4em;margin:0 0 4px;border-bottom:2px solid #7C3AED;padding-bottom:8px}
  .meta{font-size:.85em;color:#555;margin:4px 0}
  .section-label{font-size:.75em;color:#666;margin:20px 0 4px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
  p.body{margin:0;font-size:.95em;white-space:pre-wrap;line-height:1.5}
  .empty{color:#999}
  @media print{body{padding:0}}
</style></head>
<body>
  <h1>${escapeHtml(data.title || "Reunião")}</h1>
  ${headerBits ? `<p class="meta">${headerBits}</p>` : ""}
  ${participants}
  ${section("Texto completo", data.notes)}
  ${section("Encaminhamentos", data.outcomes)}
</body></html>`;

  // Imprime via iframe oculto — não sofre o bloqueio de pop-up do window.open.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    toast.error("Não foi possível preparar a impressão.");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Pequeno atraso pro conteúdo renderizar antes do diálogo de impressão.
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 100);
}
