import { getDb } from "./db";

/**
 * Preferências de VIEW (qual aba lista/cards, larguras de coluna, filtros) que
 * devem viajar com o .vistage — "o jeito que deixei a tela" acompanha o arquivo.
 *
 * Modelo (igual ao do tema): localStorage é o cache SÍNCRONO que os hooks leem
 * ao montar (pinta sem flash); document_settings é a fonte da verdade PORTÁTIL.
 * Em toda escrita gravamos nos dois; ao abrir um documento copiamos de volta os
 * valores do documento pro cache local.
 *
 * Convenção de chaves: a MESMA string vale em localStorage e em document_settings
 * (ex.: "vistage.view.gigs", "vistage.cols.pessoas"). Assim a hidratação é um
 * espelho direto, sem mapear nomes.
 */

// Prefixos PORTÁTEIS (viajam no .vistage). `vistage.view.` saiu daqui de
// propósito: o modo de visualização agora é preferência da MÁQUINA
// (localStorage, ver moduleView.ts) — não deve ser sobrescrito ao abrir um
// arquivo nem depender de salvar o documento.
const PORTABLE_PREFIXES = [
  "vistage.cols.",
  "vistage.filter.",
  "vistage.rules.",
];

function isPortableKey(key: string): boolean {
  return PORTABLE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Grava uma preferência write-through: cache local (síncrono, primeiro) +
 * documento (assíncrono, portátil). Falha de banco não atrapalha a UI — o cache
 * cobre até a próxima hidratação.
 */
export function persistDocSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage cheio/indisponível */
  }
  void getDb()
    .execute(
      `INSERT INTO document_settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
      [key, value]
    )
    .catch(() => {
      /* banco ainda não pronto */
    });
}

/**
 * Copia as preferências de view do DOCUMENTO (document_settings) para o cache
 * local. Chamada ao abrir/boot, ANTES das páginas montarem, pra elas já virem
 * com o layout salvo. Num boot em branco (document_settings vazio) é no-op e o
 * cache local da máquina é preservado.
 */
export async function hydrateViewPrefsFromDocument(): Promise<void> {
  try {
    // NÃO inclui 'vistage.view.%': o modo de visualização é da máquina
    // (localStorage) e não pode ser sobrescrito pelo que está salvo no arquivo.
    const rows = await getDb().select<{ key: string; value: string }[]>(
      `SELECT key, value FROM document_settings
        WHERE key LIKE 'vistage.cols.%'
           OR key LIKE 'vistage.filter.%'
           OR key LIKE 'vistage.rules.%'`
    );
    for (const r of rows) {
      if (r.value == null) continue;
      try {
        localStorage.setItem(r.key, r.value);
      } catch {
        /* ignora */
      }
    }
  } catch {
    /* sem document_settings (banco antigo) — ignora */
  }
}

/**
 * Espelha o cache local de preferências de view para document_settings ANTES de
 * exportar — garante que o .vistage sempre carregue o layout atual, mesmo logo
 * após um boot em branco em que document_settings foi zerado. Simétrico ao
 * safety-net da aparência.
 */
export async function persistViewPrefsToDocument(): Promise<void> {
  const pairs: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isPortableKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value != null) pairs.push([key, value]);
    }
  } catch {
    return;
  }
  for (const [key, value] of pairs) {
    try {
      await getDb().execute(
        `INSERT INTO document_settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [key, value]
      );
    } catch {
      /* ignora linha problemática */
    }
  }
}
