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

  const win = window.open("", "_blank", "width=820,height=640");
  if (!win) {
    toast.error("O navegador bloqueou a janela pop-up. Permita pop-ups para imprimir.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.print();
}
