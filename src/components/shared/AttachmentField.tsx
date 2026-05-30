import { useEffect, useState } from "react";
import { ExternalLink, ImageIcon, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import {
  DOC_EXTS,
  IMAGE_EXTS,
  assetUrl,
  deleteAttachment,
  openAttachment,
  pickFile,
  readAsDataUrl,
  saveAttachment,
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
};

export function AttachmentField({
  label,
  value,
  onChange,
  subdir,
  variant = "image",
  emphasized,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!value || variant !== "image") {
      setPreview(null);
      return;
    }
    // tenta convertFileSrc primeiro, fallback pro data URL
    const url = assetUrl(value);
    if (url) {
      setPreview(url);
    } else {
      void readAsDataUrl(value).then(setPreview);
    }
  }, [value, variant]);

  async function handlePick() {
    setWorking(true);
    try {
      const exts = variant === "image" ? IMAGE_EXTS : [...DOC_EXTS, ...IMAGE_EXTS];
      const src = await pickFile({
        title: `Selecionar ${label.toLowerCase()}`,
        extensions: exts,
        filterName: variant === "image" ? "Imagens" : "Documentos",
      });
      if (!src) return;
      const dest = await saveAttachment(src, subdir);
      // remove o anterior pra não deixar lixo
      if (value && value !== dest) await deleteAttachment(value);
      onChange(dest);
      toast.success("Arquivo anexado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setWorking(false);
    }
  }

  async function handleRemove() {
    if (!value) return;
    if (!window.confirm("Remover este arquivo?")) return;
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

  if (variant === "image") {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        {value ? (
          <div
            className={cn(
              "relative overflow-hidden rounded-md border bg-muted",
              emphasized && "ring-1 ring-primary/40"
            )}
          >
            {preview ? (
              <img
                src={preview}
                alt={label}
                className="h-40 w-full object-cover"
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <ImageIcon className="mr-2 h-4 w-4" />
                Carregando…
              </div>
            )}
            <div className="absolute right-2 top-2 flex gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePick}
                disabled={working}
              >
                <Upload className="h-3.5 w-3.5" />
                Trocar
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
              "flex h-32 w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-sm text-muted-foreground transition hover:border-primary hover:text-primary",
              emphasized && "border-primary/40"
            )}
          >
            <ImageIcon className="h-6 w-6" />
            <span>Clique pra adicionar imagem</span>
            <span className="text-xs opacity-70">
              JPG, PNG, WebP, GIF
            </span>
          </button>
        )}
      </div>
    );
  }

  // document variant
  const filename = value?.split(/[\\/]/).pop() ?? null;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2">
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
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Paperclip className="h-4 w-4" />
          Anexar arquivo
        </button>
      )}
    </div>
  );
}
