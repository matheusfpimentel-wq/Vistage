// Gera os ícones PNG do PWA (180, 192 e 512) a partir da FONTE ÚNICA
// `assets/icon.png`, a mesma que o `npx tauri icon` usa pro desktop.
//
// Antes este arquivo DESENHAVA a logo em código. Com o ícone virando uma
// imagem, desenhar aqui seria uma armadilha: rodar o script desfaria a troca em
// silêncio. E não é hipótese — os PNG commitados já estiveram fora de sincronia
// com este script uma vez. Agora ele só redimensiona a fonte, então rodar é
// sempre idempotente e os dois lados (desktop e celular) saem do mesmo arquivo.
//
// SEM dependências externas de propósito (só o `node:zlib`): tem que rodar no
// Windows sem ImageMagick instalado. Decodifica PNG de 8 bits sem entrelace,
// reamostra por média de caixa e regrava em RGB.
//
// RGB sem canal alfa (color type 2): o desenho cobre o quadrado inteiro, então
// o alfa só ocuparia espaço — e ícone de app iOS COM alfa é recusado pela App
// Store, então o mesmo arquivo serve pro PWA e pro build nativo.
//
// Rode com: node scripts/generate-icons.mjs
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const FONTE = new URL("../../assets/icon.png", import.meta.url);
// 180 é o tamanho canônico do apple-touch-icon; 192 e 512 são os do manifesto.
const TAMANHOS = [180, 192, 512];

function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(t, d) {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(d.length);
  const tb = Buffer.from(t, "ascii");
  const cr = Buffer.alloc(4);
  cr.writeUInt32BE(crc32(Buffer.concat([tb, d])));
  return Buffer.concat([l, tb, d, cr]);
}

/** Decodifica PNG 8 bits, sem entrelace, color type 2 (RGB) ou 6 (RGBA). */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("a fonte não é um PNG");
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        w: data.readUInt32BE(0),
        h: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error("PNG sem IHDR");
  if (ihdr.depth !== 8) throw new Error(`profundidade ${ihdr.depth} não suportada (só 8 bits)`);
  if (ihdr.interlace !== 0) throw new Error("PNG entrelaçado não suportado");
  const ch = ihdr.color === 2 ? 3 : ihdr.color === 6 ? 4 : 0;
  if (!ch) throw new Error(`color type ${ihdr.color} não suportado (só 2 e 6)`);

  const raw = inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr;
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filtro = raw[y * (stride + 1)];
    raw.copy(px, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    // Desfaz o filtro da linha (PNG §9). `a` = pixel à esquerda, `b` = o de
    // cima, `c` = o de cima-à-esquerda.
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filtro !== 0) throw new Error(`filtro ${filtro} desconhecido na linha ${y}`);
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, ch, px };
}

/**
 * Reamostra por MÉDIA DE CAIXA: cada pixel de saída é a média da área que ele
 * cobre na fonte. Vizinho-mais-próximo serrilharia o anel e as bordas
 * arredondadas; a média é o que o anti-serrilhado do desenho original fazia.
 */
function resample(src, N) {
  const { w, h, ch, px } = src;
  const out = Buffer.alloc(N * (N * 3 + 1));
  let p = 0;
  for (let y = 0; y < N; y++) {
    out[p++] = 0; // filtro None na linha de saída
    const y0 = Math.floor((y * h) / N);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / N));
    for (let x = 0; x < N; x++) {
      const x0 = Math.floor((x * w) / N);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / N));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * w + sx) * ch;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      }
      out[p++] = Math.round(r / n);
      out[p++] = Math.round(g / n);
      out[p++] = Math.round(b / n);
    }
  }
  return out;
}

function encodePng(N, raw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // color type 2 = RGB, sem alfa
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const fonte = decodePng(readFileSync(FONTE));
console.log(`fonte: ${fonte.w}x${fonte.h}, ${fonte.ch} canais`);
for (const N of TAMANHOS) {
  writeFileSync(new URL(`../public/icon-${N}.png`, import.meta.url), encodePng(N, resample(fonte, N)));
  console.log(`icon-${N}.png gerado`);
}
