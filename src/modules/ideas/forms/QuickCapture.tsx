import { useEffect, useRef, useState } from "react";
import { Brain, CheckCircle2, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { createIdea } from "../api";
import { InsightDie } from "../InsightDie";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Captura rápida de ideia via Ctrl+I.
 * Modo "Brain Dump": após salvar, mantém o diálogo aberto e limpa o
 * formulário para a próxima captura — ideal pra despejar várias ideias
 * em sequência sem perder o ritmo.
 */
export function QuickCapture({ open, onOpenChange }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [brainDump, setBrainDump] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setSavedCount(0);
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [open]);

  async function save() {
    if (!title.trim()) {
      toast.error("Pelo menos um título");
      return;
    }
    setSaving(true);
    try {
      await createIdea({
        title: title.trim(),
        body: body.trim() || null,
        category: null,
        tags: [],
        heat: 1,
        maturation: "Embrião",
        converted_to: null,
        converted_id: null,
      });
      setSavedCount((n) => n + 1);
      if (brainDump) {
        setTitle("");
        setBody("");
        titleRef.current?.focus();
      } else {
        toast.success("Ideia salva");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Cmd/Ctrl+Enter salva
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Captura rápida
            </DialogTitle>
            <DialogDescription>
              Solta a ideia agora, desenvolvemos depois. Cmd/Ctrl + Enter pra salvar.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => setBrainDump((b) => !b)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
              brainDump
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:bg-accent"
            )}
            title="Mantém o diálogo aberto após salvar"
          >
            <Brain className="h-3.5 w-3.5" />
            Brain Dump
            {brainDump && savedCount > 0 && (
              <span className="ml-1 rounded bg-primary/20 px-1.5 tabular-nums">
                {savedCount}
              </span>
            )}
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="sr-only">Título</Label>
            <Input
              ref={titleRef}
              placeholder="Título da ideia"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <AutoGrowTextarea
            rows={4}
            placeholder="Mais detalhes (opcional)…"
            value={body}
            onChange={(v) => setBody(v)}
            onKeyDown={onKeyDown}
          />
        </div>

        {brainDump && <InsightDie />}

        {brainDump && savedCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            {savedCount} ideia{savedCount > 1 ? "s" : ""} salva{savedCount > 1 ? "s" : ""} nesta sessão
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Fechar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {brainDump ? "Salvar e continuar" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
