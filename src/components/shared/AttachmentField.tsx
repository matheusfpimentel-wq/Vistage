import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, ImageIcon, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import {
  DOC_EXTS,
  IMAGE_EXTS,
  baseName,
  deleteAttachment,
  openAttachment,
  pickFile,
  saveAttachment,
  useImageUrl,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";

type Variant = "image" | "document";

type Props = {
  label: string;
  /** Caminho absoluto atualmente salvo, ou null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Subpasta dentro de uploads/ onde gravar — ex: "gigs/flyers". */
  subdir: string;
  variant?: Variant;
  /** Acentua visualmente o campo (útil quando obrigatório ou destaque). */
  emphasized?: boolean;
  /** Miniatura QUADRADA compacta (ex.: foto de perfil ao lado do nome). */
  square?: boolean;
};

/**
 * O drag-drop do Tauri é da JANELA, não do elemento: todo campo de anexo
 * montado recebe o mesmo evento. Quem decide se o arquivo é "deste" campo é a
 * posição do cursor, que vem em pixels FÍSICOS e precisa ser dividida pelo
 * devicePixelRatio pra comparar com o retângulo em pixels CSS.
 */
function cursorInside(el: HTMLElement | null, pos: { x: number; y: number }): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false; // não renderizado/oculto
  const dpr = window.devicePixelRatio || 1;
  const x = pos.x / dpr;
  const y = pos.y / dpr;
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function AttachmentField({
  label,
  value,
  onChange,
  subdir,
  variant = "image",
  emphasized,
  square,
}: Props) {
  const preview = useImageUrl(variant === "image" ? value : null);
  const [working, setWorking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const exts = variant === "image" ? IMAGE_EXTS : [...DOC_EXTS, ...IMAGE_EXTS];

  /** Copia o arquivo para uploads/ e troca o valor do campo. */
  const accept = useCallback(
    async (src: string) => {
      setWorking(true);
      try {
        const dest = await saveAttachment(src, subdir);
        // remove o anterior pra não deixar lixo
        if (value && value !== dest) await deleteAttachment(value);
        onChange(dest);
        toast.success(`Anexado: ${baseName(dest)}`);
      } catch (e) {
        toast.error(`Erro: ${String(e)}`);
      } finally {
        setWorking(false);
      }
    },
    [onChange, subdir, value]
  );

  async function handlePick() {
    const src = await pickFile({
      title: `Selecionar ${label.toLowerCase()}`,
      extensions: exts,
      filterName: variant === "image" ? "Imagens" : "Documentos",
    }).catch((e) => {
      toast.error(`Erro: ${String(e)}`);
      return null;
    });
    if (!src) return;
    await accept(src);
  }

  // O listener é assinado UMA vez; o que muda entre renders viaja por ref, pra
  // não re-assinar o evento da janela a cada tecla digitada no formulário.
  const onDropRef = useRef<(paths: string[]) => void>(() => {});
  useEffect(() => {
    onDropRef.current = (paths) => {
      const src = paths[0];
      if (!src) return;
      // O filtro do diálogo nativo NÃO vale pra arrastar: qualquer arquivo chega
      // aqui, então a validação de tipo tem que ser nossa.
      const ext = baseName(src).split(".").pop()?.toLowerCase() ?? "";
      if (!exts.includes(ext)) {
        toast.error(`"${baseName(src)}" não é um tipo aceito aqui (${exts.join(", ")}).`);
        return;
      }
      if (paths.length > 1) {
        toast.warning(`Este campo guarda um arquivo só — usei "${baseName(src)}".`);
      }
      void accept(src);
    };
  }, [accept, exts]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const un = await getCurrentWebview().onDragDropEvent((event) => {
          const p = event.payload;
          if (p.type === "leave") {
            setDragOver(false);
            return;
          }
          const inside = cursorInside(rootRef.current, p.position);
          if (p.type === "over") {
            setDragOver(inside);
            return;
          }
          // "drop"
          setDragOver(false);
          if (inside) onDropRef.current(p.paths);
        });
        if (disposed) un();
        else unlisten = un;
      } catch {
        // Fora do Tauri (ou API indisponível): só o clique funciona, sem erro.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function handleRemove() {
    if (!value) return;
    if (!(await confirmDialog({ title: "Remover", description: "Remover este arquivo?", confirmLabel: "Remover", destructive: true }))) return;
    await deleteAttachment(value);
    onChange(null);
  }

  async function handleOpen() {
    if (!value) return;
    try {
      await openAttachment(value);
    } catch (e) {
      toast.error(`Não consegui abrir: ${String(e)}`);
    }
  }

  // Realce de "solte aqui" — mesmo anel do estado enfatizado, mais forte.
  const dropRing = dragOver && "border-primary ring-2 ring-primary/50";

  if (variant === "image") {
    return (
      <div className="space-y-1.5" ref={rootRef}>
        <Label>{label}</Label>
        {value ? (
          <div
            className={cn(
              "relative overflow-hidden rounded-md border bg-muted",
              emphasized && "ring-1 ring-primary/40",
              dropRing
            )}
          >
            {preview ? (
              <img
                src={preview}
                alt={label}
                className={cn("w-full object-cover object-top", square ? "aspect-square" : "h-40")}
              />
            ) : (
              <div className={cn("flex items-center justify-center text-sm text-muted-foreground", square ? "aspect-square" : "h-40")}>
                <ImageIcon className="mr-2 h-4 w-4" />
                {!square && "Carregando…"}
              </div>
            )}
            <div className={cn("absolute flex gap-1", square ? "right-1 top-1" : "right-2 top-2")}>
              <Button
                type="button"
                variant="secondary"
                size={square ? "icon" : "sm"}
                className={square ? "h-7 w-7" : undefined}
                onClick={handlePick}
                disabled={working}
                aria-label="Trocar"
              >
                <Upload className="h-3.5 w-3.5" />
                {!square && "Trocar"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handleRemove}
                aria-label="Remover"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handlePick}
            disabled={working}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-sm text-muted-foreground transition hover:border-primary hover:text-primary",
              square ? "aspect-square" : "h-32",
              emphasized && "border-primary/40",
              dropRing
            )}
          >
            <ImageIcon className="h-6 w-6" />
            {!square && <span>{dragOver ? "Solte aqui" : "Clique ou arraste uma imagem"}</span>}
            {!square && <span className="text-xs opacity-70">JPG, PNG, WebP, GIF</span>}
          </button>
        )}
      </div>
    );
  }

  // document variant
  const filename = value ? baseName(value) : null;
  return (
    <div className="space-y-1.5" ref={rootRef}>
      <Label>{label}</Label>
      {value ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2",
            dropRing
          )}
        >
          <button
            type="button"
            onClick={handleOpen}
            className="flex flex-1 items-center gap-2 text-left text-sm hover:text-primary"
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate">{filename}</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePick}
            disabled={working}
          >
            Trocar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            aria-label="Remover"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          disabled={working}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-sm text-muted-foreground transition hover:border-primary hover:text-primary",
            dropRing
          )}
        >
          <Paperclip className="h-4 w-4" />
          {dragOver ? "Solte aqui" : "Anexar ou arrastar arquivo"}
        </button>
      )}
    </div>
  );
}
