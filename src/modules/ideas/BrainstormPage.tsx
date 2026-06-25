import { useRef, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { InsightDie } from "./InsightDie";
import { createIdea } from "./api";

/**
 * Modo Brainstorming (mobile/desktop): insights aleatórios pra provocar +
 * captura rápida no estilo brain dump, mostrando quantas ideias já saíram nesta
 * sessão. Cada ideia salva rola um novo insight (key={count} remonta o dado).
 */
export function BrainstormPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

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
      setRecent((r) => [title.trim(), ...r].slice(0, 30));
      setCount((n) => n + 1);
      setTitle("");
      setBody("");
      titleRef.current?.focus();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" /> Brainstorming
        </h1>
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          {count} {count === 1 ? "ideia" : "ideias"} nesta sessão
        </span>
      </div>

      {/* Novo insight a cada ideia salva (remonta o dado). */}
      <InsightDie key={count} />

      <Card>
        <CardContent className="space-y-2 py-3">
          <Input
            ref={titleRef}
            autoFocus
            placeholder="Solta o que vier, desenvolvemos depois"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
          <Textarea
            rows={2}
            placeholder="Detalhes (opcional)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button onClick={() => void save()} disabled={saving || !title.trim()} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar ideia
          </Button>
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Capturadas agora</p>
          {recent.map((t, i) => (
            <div key={i} className="rounded-md border bg-card/60 px-3 py-2 text-sm">
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
