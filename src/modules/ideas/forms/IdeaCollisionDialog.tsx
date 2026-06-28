import { useCallback, useEffect, useState } from "react";
import { Loader2, Shuffle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { createIdeaCollision, listIdeas, listMaterialSeeds, type MaterialSeed } from "../api";

type Mode = "ideas" | "material";
type Picker = { id: number; title: string };

const SEED_TIPO_LABEL: Record<MaterialSeed["tipo"], string> = {
  gig: "GIG",
  fan: "Fã",
  track: "Faixa",
  note: "Nota",
  idea: "Ideia",
};

/**
 * Colisão de ideias (§3): junta duas ideias OU uma ideia + um item aleatório do
 * material (GIG/fã/faixa/nota) → "Que ideia nasce juntando estas duas?" → cria
 * uma nova ideia relacionada às origens. Base associativa (Mednick): ideia nova
 * é recombinação nova de elementos que você já tem.
 */
export function IdeaCollisionDialog({
  open,
  onOpenChange,
  presetIdeaA,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Ideia A pré-selecionada (ex.: vindo da fila Ressurgir). */
  presetIdeaA?: { id: number; title: string } | null;
  onCreated: (newIdeaId: number) => void;
}) {
  const [ideas, setIdeas] = useState<Picker[]>([]);
  const [seeds, setSeeds] = useState<MaterialSeed[]>([]);
  const [mode, setMode] = useState<Mode>("ideas");
  const [aId, setAId] = useState<number | null>(null);
  const [bId, setBId] = useState<number | null>(null);
  const [seedKey, setSeedKey] = useState<string | null>(null); // `${tipo}:${id}`
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const seedOf = useCallback(
    (key: string | null) => seeds.find((s) => `${s.tipo}:${s.id}` === key) ?? null,
    [seeds]
  );
  const ideaTitle = (id: number | null) => ideas.find((i) => i.id === id)?.title ?? "";

  // Carrega ideias + sementes e sorteia um par inicial ao abrir.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void Promise.all([listIdeas(), listMaterialSeeds()]).then(([all, ms]) => {
      if (!alive) return;
      const pickers = all.map((i) => ({ id: i.id, title: i.title }));
      setIdeas(pickers);
      setSeeds(ms);
      const a = presetIdeaA ?? pickers[Math.floor(Math.random() * pickers.length)] ?? null;
      const others = pickers.filter((i) => i.id !== a?.id);
      const b = others[Math.floor(Math.random() * others.length)] ?? null;
      setAId(a?.id ?? null);
      setBId(b?.id ?? null);
      setSeedKey(ms.length ? `${ms[0].tipo}:${ms[0].id}` : null);
      setMode(ms.length && others.length === 0 ? "material" : "ideas");
      setTitle("");
      setBody("");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, presetIdeaA]);

  function reroll() {
    const a = presetIdeaA ?? ideas[Math.floor(Math.random() * ideas.length)] ?? null;
    setAId(a?.id ?? null);
    if (mode === "ideas") {
      const others = ideas.filter((i) => i.id !== a?.id);
      setBId(others[Math.floor(Math.random() * others.length)]?.id ?? null);
    } else if (seeds.length) {
      const s = seeds[Math.floor(Math.random() * seeds.length)];
      setSeedKey(`${s.tipo}:${s.id}`);
    }
  }

  const aLabel = ideaTitle(aId);
  const otherLabel = mode === "ideas" ? ideaTitle(bId) : (seedOf(seedKey)?.label ?? "");
  const promptText =
    aLabel && otherLabel ? `Que ideia nasce juntando "${aLabel}" + "${otherLabel}"?` : "";

  const canCreate =
    !!aId && (mode === "ideas" ? !!bId && bId !== aId : !!seedKey) && title.trim().length > 0;

  async function handleCreate() {
    if (!aId || !canCreate) return;
    setSaving(true);
    try {
      const seed = mode === "material" ? seedOf(seedKey) : null;
      const newId = await createIdeaCollision({
        title: title.trim(),
        body: body.trim() || promptText,
        ideaA: aId,
        ideaB: mode === "ideas" ? bId : null,
        seed: seed ? { tipo: seed.tipo, id: seed.id, label: seed.label } : null,
      });
      toast.success("Ideia da colisão criada");
      onOpenChange(false);
      onCreated(newId);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Colidir ideias
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : ideas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Você precisa de pelo menos uma ideia no banco para colidir.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Modo */}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMode("ideas")}
                disabled={ideas.length < 2}
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-40",
                  mode === "ideas" ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                Duas ideias
              </button>
              <button
                type="button"
                onClick={() => setMode("material")}
                disabled={seeds.length === 0}
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-40",
                  mode === "material" ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                Ideia + material
              </button>
            </div>

            {/* Ideia A */}
            <div className="space-y-1.5">
              <Label>Ideia</Label>
              <Select
                value={aId == null ? "" : String(aId)}
                onValueChange={(v) => setAId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma ideia" />
                </SelectTrigger>
                <SelectContent>
                  {ideas.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* B ou semente */}
            {mode === "ideas" ? (
              <div className="space-y-1.5">
                <Label>Outra ideia</Label>
                <Select
                  value={bId == null ? "" : String(bId)}
                  onValueChange={(v) => setBId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a segunda ideia" />
                  </SelectTrigger>
                  <SelectContent>
                    {ideas
                      .filter((i) => i.id !== aId)
                      .map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {i.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Item do material</Label>
                <Select value={seedKey ?? ""} onValueChange={(v) => setSeedKey(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um item" />
                  </SelectTrigger>
                  <SelectContent>
                    {seeds.map((s) => (
                      <SelectItem key={`${s.tipo}:${s.id}`} value={`${s.tipo}:${s.id}`}>
                        {SEED_TIPO_LABEL[s.tipo]}: {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={reroll}>
              <Shuffle className="h-3.5 w-3.5" /> Sortear
            </Button>

            {/* Prompt gerativo */}
            {promptText && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm font-medium">
                {promptText}
              </div>
            )}

            {/* Nova ideia */}
            <div className="space-y-1.5">
              <Label>
                Título da nova ideia <span className="text-destructive">*</span>
              </Label>
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A síntese das duas"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Corpo</Label>
              <Textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Solta o que vier — se deixar em branco, guardamos a pergunta da colisão"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar ideia da colisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
