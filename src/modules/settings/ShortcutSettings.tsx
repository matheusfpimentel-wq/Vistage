import { useRef, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
  getDefaultShortcuts,
  resetShortcuts,
  setShortcutKey,
  useShortcutsConfig,
  type ShortcutAction,
} from "@/lib/shortcuts";

const LABELS: Record<ShortcutAction, { label: string; description: string }> = {
  search: {
    label: "Busca global",
    description: "Abre o command palette em qualquer tela.",
  },
  newItem: {
    label: "Novo item no módulo atual",
    description: "Cria um item no contexto do módulo onde você está.",
  },
  quickCapture: {
    label: "Captura rápida de ideia",
    description: "Solta uma ideia no Banco de Ideias sem sair da tela.",
  },
};

const ACTIONS: ShortcutAction[] = ["search", "newItem", "quickCapture"];

export function ShortcutSettings() {
  const shortcuts = useShortcutsConfig();
  const defaults = getDefaultShortcuts();

  async function handleReset() {
    if (!window.confirm("Restaurar atalhos padrão?")) return;
    await resetShortcuts();
    toast.success("Atalhos restaurados");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Atalhos personalizáveis
            </CardTitle>
            <CardDescription>
              Sempre Ctrl/Cmd + a tecla escolhida. Clique em "Alterar" e
              pressione a nova letra.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Padrão
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {ACTIONS.map((action) => (
          <ShortcutRow
            key={action}
            action={action}
            current={shortcuts[action]}
            defaultKey={defaults[action]}
            label={LABELS[action].label}
            description={LABELS[action].description}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ShortcutRow({
  action,
  current,
  defaultKey,
  label,
  description,
}: {
  action: ShortcutAction;
  current: string;
  defaultKey: string;
  label: string;
  description: string;
}) {
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  function startCapture() {
    setCapturing(true);
    setTimeout(() => captureRef.current?.focus(), 30);
  }

  async function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setCapturing(false);
      return;
    }
    const k = e.key.toLowerCase();
    // ignora modificadores puros e teclas não-letra
    if (!/^[a-z0-9]$/.test(k)) return;
    e.preventDefault();
    try {
      await setShortcutKey(action, k);
      toast.success(`"${label}" agora é Ctrl/Cmd + ${k.toUpperCase()}`);
      setCapturing(false);
    } catch {
      toast.error("Falha ao salvar");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex items-center gap-2">
        {capturing ? (
          <div
            ref={captureRef}
            tabIndex={0}
            onKeyDown={onKey}
            className="rounded-md border-2 border-primary bg-primary/10 px-3 py-1 text-xs text-primary outline-none"
          >
            Aguardando tecla… (Esc cancela)
          </div>
        ) : (
          <kbd className="rounded border bg-muted px-2 py-0.5 text-xs tabular-nums">
            Ctrl/Cmd + {current.toUpperCase()}
          </kbd>
        )}
        {!capturing && current !== defaultKey && (
          <span className="text-[10px] text-muted-foreground">
            (padrão: {defaultKey.toUpperCase()})
          </span>
        )}
        {!capturing && (
          <Button variant="ghost" size="sm" onClick={startCapture}>
            Alterar
          </Button>
        )}
      </div>
    </div>
  );
}
