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
  type PasswordPromptResult,
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
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<((v: PasswordPromptResult | null) => void) | null>(null);

  useEffect(() => {
    registerPasswordPrompt((o) => {
      setOpts(o);
      setPw("");
      setConfirm("");
      setHint("");
      setError(null);
      setOpen(true);
      return new Promise<PasswordPromptResult | null>((resolve) => {
        resolverRef.current = resolve;
      });
    });
    return () => unregisterPasswordPrompt();
  }, []);

  function finish(value: PasswordPromptResult | null) {
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
    finish({ password: pw, hint: hint.trim() || null });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opts?.title ?? "Senha"}</DialogTitle>
          {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          {/* Dica salva no arquivo, mostrada ao ABRIR um documento protegido. */}
          {opts?.hint && !opts.requireConfirm && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium text-muted-foreground">Dica: </span>
              <span className="break-words">{opts.hint}</span>
            </div>
          )}
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
                  if (e.key === "Enter" && !opts?.withHint) submit();
                }}
              />
            </div>
          )}
          {/* Dica opcional ao DEFINIR a senha — fica em texto puro no arquivo. */}
          {opts?.withHint && opts.requireConfirm && (
            <div className="space-y-1.5">
              <Label>
                Dica de senha <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                type="text"
                value={hint}
                placeholder="ex.: nome do meu primeiro set"
                onChange={(e) => setHint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
              <p className="text-xs text-muted-foreground">
                A dica fica legível no arquivo mesmo sem a senha. Não escreva a própria senha aqui.
              </p>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {opts?.requireConfirm && (
            <p className="text-xs text-muted-foreground">
              Guarde bem a senha: sem ela não há como recuperar o conteúdo do arquivo.
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
