import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PromptOptions = {
  title?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type Opener = (opts: PromptOptions) => Promise<string | null>;

// Singleton imperativo (mesmo padrão do confirmDialog) — substitui window.prompt,
// bloqueado no webview do Tauri 2. Resolve com a string digitada ou null (cancelar).
let opener: Opener | null = null;

export function promptDialog(opts: string | PromptOptions): Promise<string | null> {
  const options = typeof opts === "string" ? { title: opts } : opts;
  if (opener) return opener(options);
  return Promise.resolve(window.prompt(options.title ?? "") ?? null);
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PromptOptions>({});
  const [value, setValue] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    opener = (options) => {
      setOpts(options);
      setValue(options.defaultValue ?? "");
      setOpen(true);
      return new Promise<string | null>((resolve) => {
        resolver.current = resolve;
      });
    };
    return () => {
      opener = null;
    };
  }, []);

  function settle(v: string | null) {
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  }

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && settle(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{opts.title ?? "Digite"}</DialogTitle>
            {opts.description && <DialogDescription>{opts.description}</DialogDescription>}
          </DialogHeader>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") settle(value.trim() || null);
              if (e.key === "Escape") settle(null);
            }}
            placeholder={opts.placeholder}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(null)}>
              {opts.cancelLabel ?? "Cancelar"}
            </Button>
            <Button onClick={() => settle(value.trim() || null)}>
              {opts.confirmLabel ?? "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
