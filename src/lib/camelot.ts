// Roda Camelot (harmonic mixing) — puro, sem estado nem dependência. Converte
// uma tonalidade (notação musical OU já em Camelot) num código Camelot, dá uma
// cor por código e diz se dois códigos são harmônicos. Nada aqui é persistido:
// o Camelot é DERIVADO da Key que já existe (library_tracks.music_key / SetTrack.key).

// Maior → anel "B" da roda; menor → anel "A". Raiz canônica em sustenidos.
const MAJOR: Record<string, string> = {
  C: "8B", "C#": "3B", D: "10B", "D#": "5B", E: "12B", F: "7B",
  "F#": "2B", G: "9B", "G#": "4B", A: "11B", "A#": "6B", B: "1B",
};
const MINOR: Record<string, string> = {
  C: "5A", "C#": "12A", D: "7A", "D#": "2A", E: "9A", F: "4A",
  "F#": "11A", G: "6A", "G#": "1A", A: "8A", "A#": "3A", B: "10A",
};
// Bemóis → sustenido equivalente (a tabela é toda em sustenidos).
const FLAT_TO_SHARP: Record<string, string> = {
  DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#", CB: "B", FB: "E",
};

type CamelotParts = { n: number; letter: "A" | "B" };

function parts(code: string): CamelotParts | null {
  const m = /^(1[0-2]|[1-9])([AB])$/.exec(code);
  if (!m) return null;
  return { n: Number(m[1]), letter: m[2] as "A" | "B" };
}

/**
 * Normaliza uma tonalidade no código Camelot (ex.: "8A"), ou null se não
 * reconhecer. Aceita já-Camelot ("8a", "12B"), notação musical ("Am", "A minor",
 * "Amin", "F#m", "Gbm", "C", "C maj") e símbolos ♯/♭.
 */
export function toCamelot(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Já em Camelot: 1A..12B (com ou sem espaço, caixa livre).
  const cam = /^(1[0-2]|[1-9])\s*([ABab])$/.exec(s);
  if (cam) return cam[1] + cam[2].toUpperCase();

  // Musical: raiz (A-G) + acidente opcional + modo.
  const m = /^([A-Ga-g])\s*([#♯b♭]?)\s*(.*)$/.exec(s);
  if (!m) return null;
  const accidental = m[2] === "#" || m[2] === "♯" ? "#" : m[2] === "b" || m[2] === "♭" ? "b" : "";
  let root = m[1].toUpperCase() + accidental;
  if (root.endsWith("b")) root = FLAT_TO_SHARP[root.toUpperCase()] ?? root;

  const rest = m[3].toLowerCase().replace(/\s+/g, "");
  // menor: "m", "min", "minor", "-", "aeolian" — mas NUNCA "maj"/"major".
  const isMinor = rest.startsWith("-") || rest.startsWith("aeol") ||
    (rest.startsWith("m") && !rest.startsWith("maj"));

  return (isMinor ? MINOR : MAJOR)[root] ?? null;
}

/** Cor do código Camelot (HSL): matiz por número (roda), luminosidade por anel
 *  (A menor mais escuro, B maior mais claro). Vizinhos na roda → matizes
 *  vizinhos, então faixas harmônicas ficam visualmente próximas. */
export function camelotColor(code: string | null | undefined): string | null {
  if (!code) return null;
  const p = parts(code);
  if (!p) return null;
  const hue = ((p.n - 1) * 30) % 360;
  const l = p.letter === "A" ? 46 : 57;
  return `hsl(${hue} 62% ${l}%)`;
}

/** Cor Camelot direto de uma tonalidade qualquer (musical ou Camelot). */
export function keyColor(rawKey: string | null | undefined): string | null {
  return camelotColor(toCamelot(rawKey));
}

/**
 * Dois códigos Camelot são harmônicos quando: mesma tonalidade, relativa
 * maior/menor (mesmo número, letra diferente) ou vizinhos na roda (±1 no número,
 * mesma letra — com wrap 12↔1). Aceita tonalidade musical ou Camelot nas duas.
 */
export function areHarmonic(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parts(toCamelot(a) ?? "");
  const pb = parts(toCamelot(b) ?? "");
  if (!pa || !pb) return false;
  if (pa.n === pb.n) return true; // mesma ou relativa
  if (pa.letter === pb.letter) {
    const diff = Math.abs(pa.n - pb.n);
    return diff === 1 || diff === 11; // ±1 na roda (11 = wrap)
  }
  return false;
}
