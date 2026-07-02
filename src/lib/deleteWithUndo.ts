import { toast } from "@/components/ui/toaster";

/**
 * Exclusão TRIVIAL com DESFAZER (para linhas sem filhos/vínculos: item de
 * orçamento, lote, cortesia, subtarefa, peça de marketing, etc.). Apaga na hora
 * e mostra um toast "Excluído · Desfazer" por ~6s; o desfazer reinsere um
 * registro idêntico via `restore`.
 *
 * Padrão do UI_GUIDELINES: confirmação repetida em ação trivial vira clique
 * automático e perde a função; o desfazer recupera o erro com menos interrupção.
 * Para exclusões que CASCATEIAM (removem/desvinculam dependentes) NÃO use isto —
 * use confirmDialog informando o que vai junto.
 */
export async function deleteWithUndo(opts: {
  /** Nome legível do que foi excluído (ex.: "Item de orçamento"). */
  label: string;
  /** Executa a exclusão. */
  remove: () => Promise<void>;
  /** Reinsere um registro idêntico (desfazer). */
  restore: () => Promise<void>;
  /** Recarrega a UI depois de excluir e depois de desfazer. */
  onChange?: () => void | Promise<void>;
}): Promise<void> {
  const { label, remove, restore, onChange } = opts;
  try {
    await remove();
  } catch (e) {
    toast.error(`Erro ao excluir: ${String(e)}`);
    return;
  }
  await onChange?.();
  toast.success(`${label} excluído`, {
    duration: 6000,
    action: {
      label: "Desfazer",
      onClick: () => {
        void (async () => {
          try {
            await restore();
            await onChange?.();
            toast.success(`${label} restaurado`);
          } catch (e) {
            toast.error(`Erro ao desfazer: ${String(e)}`);
          }
        })();
      },
    },
  });
}
