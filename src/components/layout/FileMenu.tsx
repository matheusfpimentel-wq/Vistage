import { useEffect, useRef, useState } from "react";
import { FilePlus2, FileText, Flame, FolderOpen, Loader2, Lock, LockOpen, Save, SaveAll, ShieldAlert } from "lucide-react";
import { useDocumentStore, displayDocName } from "@/lib/document";
import { useDocPassword, setDocPassword } from "@/lib/docPassword";
import { promptPasswordWithHint } from "@/lib/passwordPrompt";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { loadFocusStreak } from "@/modules/foco/api";
import { DATA_CHANGED } from "@/lib/events";
import { cn } from "@/lib/utils";

/**
 * Menu "Arquivo" + nome do documento aberto. UM ARQUIVO POR VEZ — sem abas:
 * Abrir substitui o documento atual (o banco é único). A sequência de foco (🔥)
 * aparece ao lado do nome. O menu cobre Novo / Abrir / Salvar / Salvar como / senha.
 */
export function FileMenu() {
  const { currentName, busy, dirty, open, save, saveAs, newDocument } = useDocumentStore();
  const isProtected = useDocPassword((s) => s.password != null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Streak de foco — mostrado ao lado do nome; atualiza ao registrar sessões.
  useEffect(() => {
    const refresh = () => void loadFocusStreak().then(setStreak).catch(() => {});
    refresh();
    window.addEventListener(DATA_CHANGED, refresh);
    return () => window.removeEventListener(DATA_CHANGED, refresh);
  }, []);

  async function handleProtect() {
    setMenuOpen(false);
    const res = await promptPasswordWithHint({
      title: "Proteger com senha",
      description: "Defina uma senha — ela será pedida toda vez que este arquivo for aberto.",
      confirmLabel: "Proteger",
      requireConfirm: true,
    });
    if (!res?.password) return;
    setDocPassword(res.password, res.hint);
    const saved = await save();
    if (saved) toast.success("Documento protegido por senha.");
  }

  async function handleRemovePassword() {
    setMenuOpen(false);
    const ok = await confirmDialog({
      title: "Remover senha",
      description: "O arquivo deixará de ser protegido e poderá ser aberto sem senha. Continuar?",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    setDocPassword(null);
    const saved = await save();
    if (saved) toast.success("Senha removida.");
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const docName = displayDocName(currentName) ?? "Sem título";

  return (
    <div className="relative flex items-center gap-1.5" ref={ref}>
      {/* Menu "Arquivo" */}
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition",
          "text-muted-foreground hover:bg-accent hover:text-foreground",
          menuOpen && "bg-accent text-foreground"
        )}
        title="Arquivo"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        <span className="hidden md:inline">Arquivo</span>
      </button>

      {/* Documento atual (nome + streak) */}
      <div className="flex items-center gap-1 rounded-md border border-primary/30 bg-accent px-2 py-1 text-xs text-foreground">
        {isProtected && <Lock className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Protegido" />}
        <span className="max-w-[200px] truncate" title={docName}>{docName}</span>
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Não salvo" />}
        {streak > 0 && (
          <span
            className="ml-0.5 flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
            title={`${streak} dia${streak === 1 ? "" : "s"} seguidos de foco`}
          >
            <Flame className="h-3 w-3" />
            {streak}
          </span>
        )}
      </div>

      {menuOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover shadow-md">
          <MenuItem icon={<FilePlus2 className="h-4 w-4" />} label="Novo" onClick={() => { setMenuOpen(false); void newDocument(); }} />
          <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="Abrir…" onClick={() => { setMenuOpen(false); void open(); }} />
          <div className="border-t" />
          <MenuItem
            icon={<Save className="h-4 w-4" />}
            label="Salvar"
            shortcut="Ctrl S"
            onClick={() => { setMenuOpen(false); void save(); }}
          />
          <MenuItem
            icon={<SaveAll className="h-4 w-4" />}
            label="Salvar como…"
            onClick={() => { setMenuOpen(false); void saveAs(); }}
          />
          <div className="border-t" />
          {isProtected ? (
            <MenuItem icon={<LockOpen className="h-4 w-4" />} label="Remover senha" onClick={() => void handleRemovePassword()} />
          ) : (
            <MenuItem icon={<Lock className="h-4 w-4" />} label="Proteger com senha…" onClick={() => void handleProtect()} />
          )}
          <div className="flex items-start gap-1.5 border-t bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>O arquivo .vistage guarda suas senhas e tokens das integrações. Não compartilhe.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-accent"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{shortcut}</kbd>
      )}
    </button>
  );
}
