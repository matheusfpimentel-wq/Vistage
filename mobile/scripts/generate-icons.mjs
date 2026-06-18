// Gera os ícones PNG do PWA (192 e 512) sem dependências externas: encoder PNG
// mínimo (zlib do Node + CRC32) desenhando o "vinil" do app. Rode com:
//   node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [11, 11, 16, 255]; // #0b0b10
const ACCENT = [124, 92, 255, 255]; // #7c5cff
const FAINT = [58, 47, 107, 255]; // #3a2f6b

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function iconPng(N) {
  const s = N / 512; // escala a partir do viewBox 512 do icon.svg
  const c = N / 2;
  const ringR = 158 * s, ringHalf = 13 * s; // anel externo (accent)
  const faintR = 104 * s, faintHalf = 5 * s; // anel interno (faint)
  const dotR = 34 * s, holeR = 10 * s; // furo central

  const raw = Buffer.alloc(N * (N * 4 + 1));
  let p = 0;
  for (let y = 0; y < N; y++) {
    raw[p++] = 0; // filtro "none" por scanline
    for (let x = 0; x < N; x++) {
      const dx = x - c + 0.5;
      const dy = y - c + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      let col = BG;
      if (Math.abs(d - faintR) <= faintHalf) col = FAINT;
      if (Math.abs(d - ringR) <= ringHalf) col = ACCENT;
      if (d <= dotR) col = d <= holeR ? BG : ACCENT;
      raw[p++] = col[0];
      raw[p++] = col[1];
      raw[p++] = col[2];
      raw[p++] = col[3];
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

for (const N of [192, 512]) {
  const out = new URL(`../public/icon-${N}.png`, import.meta.url);
  writeFileSync(out, iconPng(N));
  console.log(`icon-${N}.png gerado`);
}
