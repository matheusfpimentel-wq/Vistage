import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  registerPasswordPrompt,
  unregisterPasswordPrompt,
  type PasswordPromptOpts,
} from "@/lib/passwordPrompt";

/**
 * Diálogo imperativo de senha — montado uma vez (App). Resolve a Promise de
 * promptPassword com a senha digitada, ou null se cancelar.
 */
export function PasswordPromptDialog() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PasswordPromptOpts | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    registerPasswordPrompt((o) => {
      setOpts(o);
      setPw("");
      setConfirm("");
      setError(null);
      setOpen(true);
      return new Promise<string | null>((resolve) => {
        resolverRef.current = resolve;
      });
    });
    return () => unregisterPasswordPrompt();
  }, []);

  function finish(value: string | null) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }

  function submit() {
    if (!pw) {
      setError("Digite uma senha.");
      return;
    }
    if (opts?.requireConfirm && pw !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    finish(pw);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opts?.title ?? "Senha"}</DialogTitle>
          {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Senha</Label>
            <Input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !opts?.requireConfirm) submit();
              }}
            />
          </div>
          {opts?.requireConfirm && (
            <div className="space-y-1.5">
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {opts?.requireConfirm && (
            <p className="text-xs text-muted-foreground">
              Guarde bem a senha — sem ela não há como recuperar o conteúdo do arquivo.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => finish(null)}>
            Cancelar
          </Button>
          <Button onClick={submit}>{opts?.confirmLabel ?? "Confirmar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
