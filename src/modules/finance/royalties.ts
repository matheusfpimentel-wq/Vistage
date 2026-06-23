import { getDb } from "@/lib/db";
import { listTracks } from "@/modules/music/api";
import { createCategory, createTransaction, listCategories } from "./api";

// ============================================================
// Importação de royalties (DistroKid / Beatport / genérico)
//
// Lê um relatório CSV/TSV, agrupa por FAIXA × MÊS, converte a moeda usando a
// cotação histórica da data do lançamento (último dia do mês de venda) e cria
// uma receita por (faixa, mês) na categoria "Royalties". É idempotente: cada
// lançamento carrega um `source_ref` único, então reimportar o mesmo relatório
// não duplica nada.
// ============================================================

export type RoyaltyPlatform = "distrokid" | "beatport" | "generic";

type RoyaltyLine = {
  period: string; // YYYY-MM
  title: string;
  artist: string | null;
  isrc: string | null;
  store: string | null;
  quantity: number | null;
  amount: number; // na moeda do relatório
};

export type ParsedRoyalties = {
  platform: RoyaltyPlatform;
  currency: string; // melhor palpite (USD/EUR/BRL…)
  lines: RoyaltyLine[];
  source_filename: string;
  recognized: number;
  skipped: number;
};

/** Uma faixa em um mês — vira um lançamento de receita. */
export type RoyaltyTrackMonth = {
  source_ref: string;
  platform: RoyaltyPlatform;
  period: string; // YYYY-MM
  date: string; // YYYY-MM-DD (último dia do mês = data do lançamento)
  title: string;
  artist: string | null;
  isrc: string | null;
  stores: string[];
  quantity: number;
  amountSrc: number; // soma na moeda de origem
  currency: string;
  rate: number | null; // moeda → BRL na data
  amountBrl: number | null; // amountSrc × rate
  trackId: number | null; // vínculo com a faixa da biblioteca, se casou pelo título
  alreadyImported: boolean;
};

// ─── Utilidades de parsing ──────────────────────────────────────────────────

/** Decodifica o buffer respeitando BOM UTF-16 (relatórios variam de encoding). */
export function decodeReportBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Parser CSV/TSV que respeita aspas (campos com o delimitador dentro). */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function findCol(header: string[], ...names: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i !== -1) return i;
  }
  for (const n of names) {
    const i = norm.findIndex((h) => h.includes(n));
    if (i !== -1) return i;
  }
  return -1;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  fev: "02", abr: "04", mai: "05", ago: "08", set: "09", out: "10", dez: "12",
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05",
  junho: "06", julho: "07", agosto: "08", setembro: "09", outubro: "10",
  novembro: "11", dezembro: "12", january: "01", february: "02", march: "03",
  april: "04", june: "06", july: "07", august: "08", september: "09",
  october: "10", november: "11", december: "12",
};

/** Normaliza várias formas de data/mês para "YYYY-MM". */
function normalizePeriod(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})/); // YYYY-MM(-DD)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // DD/MM/YYYY ou MM/DD/YYYY
  if (m) {
    let mm = m[2];
    if (parseInt(mm, 10) > 12) mm = m[1]; // era MM/DD
    return `${m[3]}-${mm.padStart(2, "0")}`;
  }
  const lower = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ym = lower.match(/([a-z]+)[\s/.-]+(\d{4})/);
  if (ym && MONTHS[ym[1]]) return `${ym[2]}-${MONTHS[ym[1]]}`;
  const my = lower.match(/(\d{4})[\s/.-]+([a-z]+)/);
  if (my && MONTHS[my[2]]) return `${my[1]}-${MONTHS[my[2]]}`;
  return null;
}

/** "1.234,56" / "$1,234.56" / "(1.23)" → number. */
function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  let t = s.trim().replace(/[^\d,.()-]/g, "");
  if (!t) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma > lastDot) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : neg ? -n : n;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Título normalizado para casar com a biblioteca (tira "(Original Mix)" etc.). */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function periodToDate(period: string): string {
  const [y, mo] = period.split("-").map(Number);
  const last = new Date(y, mo, 0).getDate(); // dia 0 do mês seguinte = último dia
  return `${period}-${String(last).padStart(2, "0")}`;
}

function detectPlatform(headerJoined: string): RoyaltyPlatform {
  const h = headerJoined.toLowerCase();
  if (h.includes("sale month") || h.includes("earnings (usd)") || h.includes("distrokid"))
    return "distrokid";
  if (h.includes("beatport") || (h.includes("release") && h.includes("label")))
    return "beatport";
  return "generic";
}

function detectCurrency(header: string[], platform: RoyaltyPlatform): string {
  const joined = header.join(" ").toLowerCase();
  const m = joined.match(/\((usd|eur|brl|gbp)\)/);
  if (m) return m[1].toUpperCase();
  if (joined.includes("usd") || joined.includes("$")) return "USD";
  if (joined.includes("eur") || joined.includes("€")) return "EUR";
  if (joined.includes("brl") || joined.includes("r$")) return "BRL";
  return platform === "beatport" ? "EUR" : "USD";
}

// ─── Parse ──────────────────────────────────────────────────────────────────

export function parseRoyalties(filename: string, content: string): ParsedRoyalties {
  const clean = content.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t")
    ? "\t"
    : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows = parseDelimited(clean, delim);
  if (rows.length < 2) throw new Error("Arquivo vazio ou sem linhas de dados.");

  const header = rows[0].map((h) => h.trim());
  const platform = detectPlatform(header.join(" "));
  const currency = detectCurrency(header, platform);

  const idxPeriod = findCol(header, "sale month", "periodo", "período", "mes de venda", "mês de venda", "month", "mes");
  const idxDate = findCol(header, "reporting date", "sale date", "data da venda", "payment date", "date", "data");
  const idxTitle = findCol(header, "track title", "title", "titulo", "título", "track name", "track", "faixa", "song", "musica", "música");
  const idxArtist = findCol(header, "artist", "artists", "artista", "artistas");
  const idxIsrc = findCol(header, "isrc");
  const idxStore = findCol(header, "store", "platform", "plataforma", "loja", "retailer", "dsp");
  const idxQty = findCol(header, "quantity", "quantidade", "units", "streams", "downloads", "sales", "qty");
  const idxAmount = findCol(header, "earnings (usd)", "earnings", "net revenue", "valor liquido", "valor líquido", "payout", "amount", "valor", "receita", "net", "royalty", "royalties", "total");

  if (idxTitle === -1)
    throw new Error("Não achei a coluna de faixa/título. Exporte o relatório com cabeçalho.");
  if (idxAmount === -1)
    throw new Error("Não achei a coluna de valor/earnings no relatório.");
  if (idxPeriod === -1 && idxDate === -1)
    throw new Error("Não achei a coluna de mês/data no relatório.");

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const lines: RoyaltyLine[] = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, idxTitle);
    const period =
      normalizePeriod(idxPeriod >= 0 ? r[idxPeriod] : undefined) ??
      normalizePeriod(idxDate >= 0 ? r[idxDate] : undefined);
    const amount = parseMoney(idxAmount >= 0 ? r[idxAmount] : undefined);
    if (!title || !period || amount === 0) {
      skipped++;
      continue;
    }
    const qtyRaw = cell(r, idxQty).replace(/[^\d-]/g, "");
    lines.push({
      period,
      title,
      artist: cell(r, idxArtist) || null,
      isrc: cell(r, idxIsrc) || null,
      store: cell(r, idxStore) || null,
      quantity: qtyRaw ? parseInt(qtyRaw, 10) || null : null,
      amount,
    });
  }
  if (lines.length === 0)
    throw new Error("Nenhuma linha de royalty reconhecida — confira o arquivo.");

  return {
    platform,
    currency,
    lines,
    source_filename: filename,
    recognized: lines.length,
    skipped,
  };
}

// ─── Agregação por faixa × mês ──────────────────────────────────────────────

export async function buildRoyaltyPlan(parsed: ParsedRoyalties): Promise<RoyaltyTrackMonth[]> {
  const groups = new Map<string, RoyaltyTrackMonth>();
  for (const ln of parsed.lines) {
    const trackKey =
      ln.isrc && ln.isrc.trim()
        ? `isrc-${slug(ln.isrc)}`
        : slug(`${ln.title}-${ln.artist ?? ""}`);
    const source_ref = `royalty:${parsed.platform}:${ln.period}:${trackKey}`;
    let g = groups.get(source_ref);
    if (!g) {
      g = {
        source_ref,
        platform: parsed.platform,
        period: ln.period,
        date: periodToDate(ln.period),
        title: ln.title,
        artist: ln.artist,
        isrc: ln.isrc,
        stores: [],
        quantity: 0,
        amountSrc: 0,
        currency: parsed.currency,
        rate: null,
        amountBrl: null,
        trackId: null,
        alreadyImported: false,
      };
      groups.set(source_ref, g);
    }
    g.amountSrc += ln.amount;
    if (ln.quantity) g.quantity += ln.quantity;
    if (ln.store && !g.stores.includes(ln.store)) g.stores.push(ln.store);
  }

  const items = Array.from(groups.values()).sort((a, b) =>
    a.period !== b.period ? (a.period < b.period ? 1 : -1) : b.amountSrc - a.amountSrc
  );

  // arredonda a soma na moeda de origem (evita resíduos de ponto flutuante)
  for (const it of items) it.amountSrc = Math.round(it.amountSrc * 100) / 100;

  // marca os que já foram importados (idempotência)
  const existing = await existingRefs(items.map((i) => i.source_ref));
  for (const it of items) it.alreadyImported = existing.has(it.source_ref);

  // vincula à faixa da biblioteca pelo título (melhor esforço — não há ISRC lá)
  try {
    const tracks = await listTracks();
    const byTitle = new Map<string, number>();
    for (const t of tracks) {
      const title = (t.title_final && t.title_final.trim()) || t.title_working;
      if (title) byTitle.set(normTitle(title), t.id);
    }
    for (const it of items) {
      const id = byTitle.get(normTitle(it.title));
      if (id) it.trackId = id;
    }
  } catch {
    /* módulo de música indisponível — segue sem vínculo */
  }

  return items;
}

async function existingRefs(refs: string[]): Promise<Set<string>> {
  const db = getDb();
  const out = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const ph = chunk.map((_, j) => `$${j + 1}`).join(",");
    const rows = await db.select<{ source_ref: string }[]>(
      `SELECT source_ref FROM finance_transactions WHERE source_ref IN (${ph})`,
      chunk
    );
    for (const r of rows) out.add(r.source_ref);
  }
  return out;
}

// ─── Câmbio histórico (cotação da data) ─────────────────────────────────────

async function getAppSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setAppSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

/**
 * Cotação histórica moeda→BRL na data (frankfurter.app, dados do BCE, sem chave).
 * Cacheia em app_settings (por máquina) pra funcionar offline na reimportação.
 * Em fim de semana/feriado o serviço devolve o último dia útil disponível.
 */
async function getRateToBRL(base: string, date: string): Promise<number | null> {
  if (base === "BRL") return 1;
  const key = `fx.rate.${base}.${date}`;
  const cached = await getAppSetting(key);
  if (cached) {
    const n = parseFloat(cached);
    if (!isNaN(n) && n > 0) return n;
  }
  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${base}&to=BRL`);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json?.rates?.BRL;
    if (typeof rate === "number" && rate > 0) {
      await setAppSetting(key, String(rate));
      return rate;
    }
  } catch {
    /* offline ou bloqueado — devolve null, cai no fallback manual */
  }
  return null;
}

/**
 * Resolve a conversão para BRL de cada item usando a cotação da `date`. Se a
 * cotação automática falhar e houver `fallbackRate`, usa ela. Devolve novos
 * objetos (não muta os de entrada).
 */
export async function resolveRates(
  items: RoyaltyTrackMonth[],
  opts: { currency?: string; fallbackRate?: number | null } = {}
): Promise<RoyaltyTrackMonth[]> {
  const cache = new Map<string, number | null>();
  const out: RoyaltyTrackMonth[] = [];
  for (const it of items) {
    const cur = opts.currency ?? it.currency;
    const ck = `${cur}:${it.date}`;
    let rate = cache.has(ck) ? cache.get(ck)! : await getRateToBRL(cur, it.date);
    cache.set(ck, rate);
    if (rate == null && opts.fallbackRate && opts.fallbackRate > 0) rate = opts.fallbackRate;
    const amountBrl = rate != null ? Math.round(it.amountSrc * rate * 100) / 100 : null;
    out.push({ ...it, currency: cur, rate, amountBrl });
  }
  return out;
}

// ─── Import ─────────────────────────────────────────────────────────────────

async function getOrCreateRoyaltyCategory(): Promise<number> {
  const cats = await listCategories("income");
  const found = cats.find((c) => c.name.trim().toLowerCase() === "royalties");
  if (found) return found.id;
  return createCategory("Royalties", "income");
}

function buildDescription(it: RoyaltyTrackMonth): string {
  const [y, m] = it.period.split("-");
  const platformLabel =
    it.platform === "distrokid" ? "DistroKid" : it.platform === "beatport" ? "Beatport" : null;
  const meta: string[] = [];
  if (platformLabel) meta.push(platformLabel);
  if (it.quantity) meta.push(`${it.quantity} vendas/streams`);
  if (it.rate != null)
    meta.push(`${it.currency} ${it.amountSrc.toFixed(2)} @ ${it.rate.toFixed(4)}`);
  const head = `${it.title} · royalties ${m}/${y}`;
  return meta.length ? `${head} (${meta.join(" · ")})` : head;
}

/** Cria as receitas dos itens novos (ignora já importados e sem cotação). */
export async function importRoyaltyTrackMonths(
  items: RoyaltyTrackMonth[]
): Promise<{ created: number; skipped: number; noRate: number }> {
  let created = 0;
  let skipped = 0;
  let noRate = 0;
  const catId = await getOrCreateRoyaltyCategory();
  for (const it of items) {
    if (it.alreadyImported) {
      skipped++;
      continue;
    }
    if (it.amountBrl == null) {
      noRate++;
      continue;
    }
    await createTransaction({
      kind: "income",
      amount: it.amountBrl,
      date: it.date,
      description: buildDescription(it),
      category_id: catId,
      gig_id: null,
      contact_id: null,
      class_id: null,
      student_package_id: null,
      track_id: it.trackId,
      party_id: null,
      music_cost_id: null,
      gig_sync: 0,
      class_sync: 0,
      status: "Recebido",
      payment_method: null,
      expense_type: null,
      receipt_file_path: null,
      tax_relevant: 0,
      recurring_id: null,
      source_ref: it.source_ref,
    });
    created++;
  }
  return { created, skipped, noRate };
}

/** Receita (royalties) de uma faixa — income com track_id, recentes primeiro. */
export async function listTrackRoyalties(
  trackId: number
): Promise<{ id: number; amount: number; date: string | null; description: string | null }[]> {
  const db = getDb();
  return db.select<{ id: number; amount: number; date: string | null; description: string | null }[]>(
    `SELECT id, amount, date, description
       FROM finance_transactions
      WHERE track_id = $1 AND kind = 'income'
      ORDER BY date DESC, id DESC`,
    [trackId]
  );
}

/** Adiciona UMA receita de royalties a uma faixa (manual, fora do import CSV). */
export async function addTrackRoyalty(input: {
  trackId: number;
  amount: number;
  date: string | null;
  description: string | null;
}): Promise<number> {
  const catId = await getOrCreateRoyaltyCategory();
  return createTransaction({
    kind: "income",
    amount: input.amount,
    // Receita exige data; sem data informada, usa hoje.
    date: input.date ?? new Date().toISOString().slice(0, 10),
    description: input.description,
    category_id: catId,
    gig_id: null,
    contact_id: null,
    class_id: null,
    student_package_id: null,
    track_id: input.trackId,
    party_id: null,
    music_cost_id: null,
    gig_sync: 0,
    class_sync: 0,
    status: "Recebido",
    payment_method: null,
    expense_type: null,
    receipt_file_path: null,
    tax_relevant: 0,
    recurring_id: null,
  });
}
