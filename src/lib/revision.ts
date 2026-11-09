// Contador de escritas do banco local — a medida de "o documento mudou".
//
// Por que contador e não flag: o rastreio anterior era por EVENTO
// (`emitDataChanged` espalhado por ~111 funções, atrás do portão `bootSettled`)
// e precisou de remendo nas DUAS direções. O commit 32c54c8 adicionou emissões
// que faltavam (edição não marcava sujo); depois apareceu o caso oposto, em que
// escritas automáticas marcavam sujo sem o usuário editar nada. Quando a mesma
// camada precisa de correção nos dois sentidos, a medida está no lugar errado:
// ela depende de alguém lembrar de emitir, e de um portão de tempo acertar.
//
// Aqui a medida é direta: quantas LINHAS o banco alterou nesta sessão. Toda
// escrita passa por `db_execute`/`db_execute_batch`, que já devolvem a contagem,
// então o número não depende de evento nenhum. De brinde, um UPDATE que não
// altera linha alguma não conta — e de fato não deveria sujar o documento.

/**
 * Tabelas de MÁQUINA: configuração da instalação, não conteúdo do documento.
 * Precisa bater com `MACHINE_TABLES` de `backup.ts`, que já as exclui de
 * `hasAnyDocumentData` pelo mesmo motivo. Escrita aqui não suja o documento —
 * sem isso, o carimbo de `lastSyncAt` que o sync grava a cada salvamento
 * marcaria o arquivo como alterado imediatamente depois de ser salvo.
 */
const MACHINE_TABLES = new Set(["app_settings", "gcal_auth", "_migrations"]);

/** Extrai a tabela alvo de um INSERT/UPDATE/DELETE/REPLACE. null se não for escrita. */
function targetTable(sql: string): string | null {
  const m =
    /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+"?(\w+)"?/i.exec(
      sql
    );
  return m ? m[1] : null;
}

let rowsWritten = 0;

/**
 * Soma as linhas alteradas por uma escrita. Chamado pelo proxy do banco.
 * Ignora tabela de máquina; na dúvida (SQL que não casa com o padrão), CONTA —
 * um falso positivo custa um clique a mais, um falso negativo custa dados.
 */
export function bumpRevision(sql: string, rows: number): void {
  if (!Number.isFinite(rows) || rows <= 0) return;
  const table = targetTable(sql);
  if (table && MACHINE_TABLES.has(table)) return;
  rowsWritten += rows;
}

/**
 * Versão para lote: o `executeBatch` devolve um TOTAL, sem dizer de qual
 * statement veio cada linha, então não dá pra atribuir por tabela. Só ignora o
 * lote quando TODOS os statements miram tabela de máquina; qualquer statement de
 * documento faz o lote inteiro contar.
 */
export function bumpRevisionBatch(sqls: string[], rows: number): void {
  if (!Number.isFinite(rows) || rows <= 0) return;
  const allMachine =
    sqls.length > 0 &&
    sqls.every((sql) => {
      const t = targetTable(sql);
      return t !== null && MACHINE_TABLES.has(t);
    });
  if (allMachine) return;
  rowsWritten += rows;
}

/** Total de linhas de documento alteradas nesta sessão (monotônico). */
export function revision(): number {
  return rowsWritten;
}
