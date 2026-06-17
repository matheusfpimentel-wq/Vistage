import { create } from "zustand";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { Button } from "./button";

export type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão de confirmar em vermelho (ação destrutiva). Padrão: true. */
  destructive?: boolean;
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions;
  resolve: ((ok: boolean) => void) | null;
  request: (options: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
};

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: {},
  resolve: null,
  request: (options) =>
    new Promise<boolean>((resolve) => {
      // se já houver um pedido aberto, cancela o anterior
      get().resolve?.(false);
      set({ open: true, options, resolve });
    }),
  settle: (ok) => {
    get().resolve?.(ok);
    set({ open: false, resolve: null });
  },
}));

/**
 * Confirmação imperativa no tema do app — substitui `window.confirm`
 * (que abre a caixa nativa do SO, feia e fora do tema dark).
 *
 *   if (!(await confirm({ description: "Excluir isto?" }))) return;
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().request(options);
}

/** Montado uma única vez no shell do app. */
export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const settle = useConfirmStore((s) => s.settle);

  const {
    title = "Tem certeza?",
    description,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    destructive = true,
  } = options;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
      <DialogContent className="max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => settle(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
