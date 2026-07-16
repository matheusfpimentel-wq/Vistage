import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadDocB64, type DriveFile } from "./api";

// Visor de PDF embutido (pdf.js). Baixa os bytes pela camada Rust do Drive e
// renderiza em <canvas> — não depende de iframe/preview do Drive, então funciona
// igual no Windows e no Mac e não exige mudança de CSP. A lib é carregada sob
// demanda (dynamic import) pra não pesar no bundle de quem nunca abre um PDF.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function PdfViewerDialog({
  file,
  onOpenChange,
}: {
  file: DriveFile | null;
  onOpenChange: (open: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [pdfjs, b64] = await Promise.all([
          import("pdfjs-dist"),
          downloadDocB64(file.id),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ data: b64ToBytes(b64) }).promise;
        if (cancelled) return;
        const host = hostRef.current;
        if (!host) return;
        host.replaceChildren();
        const dpr = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const width = host.clientWidth || 760;
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, width / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = "100%";
          canvas.style.maxWidth = `${Math.floor(viewport.width)}px`;
          canvas.style.height = "auto";
          canvas.className = "mx-auto mb-3 rounded-md border bg-white shadow-sm";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.scale(dpr, dpr);
          host.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-2 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="min-w-0 flex-1 truncate">{file?.name ?? "Documento"}</span>
            {file?.web_view_link && (
              <button
                className="shrink-0 text-primary"
                title="Abrir no Drive"
                onClick={() => void openExternal(file.web_view_link!)}
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="p-6 text-center text-sm text-destructive">
            Não consegui abrir o PDF: {error}
          </p>
        ) : (
          <div className="relative min-h-[320px] overflow-y-auto overflow-x-hidden rounded-md bg-muted/30 p-3">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando PDF…
              </div>
            )}
            <div ref={hostRef} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
