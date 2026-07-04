// §5 — captura de foto/clipe pra virar matéria-prima no Conteúdo do PC.
// Usa um <input type=file> comum: funciona igual no PWA e no WebView do
// Capacitor, sem plugin nativo novo. Imagem é comprimida (downscale + jpeg) pra
// segurar o custo de upload; vídeo passa direto com teto por arquivo.

export type PickedMedia = {
  blob: Blob;
  mediaKind: "photo" | "clip";
  ext: string;
  mime: string;
};

const MAX_PHOTO_DIM = 1600; // maior lado após o downscale
const PHOTO_QUALITY = 0.82; // qualidade do jpeg
export const MAX_CLIP_BYTES = 25 * 1024 * 1024; // teto por clipe (25 MB)

/** Abre o seletor (câmera ou galeria) e devolve o arquivo escolhido, ou null. */
export function pickMedia(accept: "image" | "video"): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept === "image" ? "image/*" : "video/*";
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      resolve(f);
    };
    input.onchange = () => finish(input.files?.[0] ?? null);
    // Se o usuário cancelar, alguns navegadores não disparam change; solta null
    // quando a janela volta ao foco (sem travar a Promise).
    window.addEventListener(
      "focus",
      () => setTimeout(() => finish(input.files?.[0] ?? null), 400),
      { once: true }
    );
    input.click();
  });
}

/** Comprime a imagem (ou valida o teto do clipe). Retorna erro legível se falhar. */
export async function prepareMedia(
  file: File
): Promise<PickedMedia | { error: string }> {
  if (file.type.startsWith("video/")) {
    if (file.size > MAX_CLIP_BYTES)
      return { error: "Clipe muito grande (máx. 25 MB). Corte antes de enviar." };
    return {
      blob: file,
      mediaKind: "clip",
      ext: extFromType(file.type) || "mp4",
      mime: file.type || "video/mp4",
    };
  }
  try {
    const blob = await compressImage(file, MAX_PHOTO_DIM, PHOTO_QUALITY);
    return { blob, mediaKind: "photo", ext: "jpg", mime: "image/jpeg" };
  } catch {
    // Não deu pra comprimir (formato exótico): manda o original.
    return {
      blob: file,
      mediaKind: "photo",
      ext: extFromType(file.type) || "jpg",
      mime: file.type || "image/jpeg",
    };
  }
}

function extFromType(mime: string): string {
  const m = mime.split("/")[1]?.toLowerCase();
  if (!m) return "";
  if (m === "jpeg") return "jpg";
  if (m === "quicktime") return "mov";
  return m.replace(/[^a-z0-9]/g, "");
}

async function compressImage(
  file: File,
  maxDim: number,
  quality: number
): Promise<Blob> {
  const { source, w: ow, h: oh } = await decode(file);
  const scale = Math.min(1, maxDim / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * scale));
  const h = Math.max(1, Math.round(oh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, w, h);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality)
  );
}

async function decode(
  file: File
): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, w: bmp.width, h: bmp.height };
    } catch {
      /* cai no <img> */
    }
  }
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("decode"));
      img.src = url;
    });
    return { source: img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
