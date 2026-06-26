import { useEffect, useRef, useState } from "react";
import { FilePlus2, FileText, Flame, FolderOpen, Loader2, Lock, LockOpen, Plus, Save, SaveAll, ShieldAlert, X } from "lucide-react";
import { useDocumentStore, displayDocName } from "@/lib/document";
import { useDocPassword, setDocPassword } from "@/lib/docPassword";
import { promptPasswordWithHint } from "@/lib/passwordPrompt";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { loadFocusStreak } from "@/modules/foco/api";
import { DATA_CHANGED } from "@/lib/events";
import { cn } from "@/lib/utils";

/**
 * Barra de abas de documentos no estilo navegador: cada aba é um arquivo
 * .vistage aberto. SÓ UM carrega por vez — clicar numa aba salva o atual e
 * carrega o dela. A aba ativa mostra o 🔥 da sequência de foco. "+" abre um
 * documento novo em branco; o menu "Arquivo" cobre Abrir/Salvar/senha.
 */
export function FileMenu() {
  const {
    tabs,
    currentPath,
    currentName,
    busy,
    dirty,
    open,
    save,
    saveAs,
    switchToTab,
    closeTab,
    newDocument,
  } = useDocumentStore();
  const isProtected = useDocPassword((s) => s.password != null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Streak de foco — mostrado dentro da aba ativa; atualiza ao registrar sessões.
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

  // Documento em branco (sem caminho) também aparece como uma aba ativa "Sem título".
  const showBlankTab = currentPath == null;

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

      {/* Abas */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((path) => {
          const active = path === currentPath;
          return (
            <Tab
              key={path}
              name={displayDocName(fileNameOf(path)) ?? "Arquivo"}
              active={active}
              dirty={active && dirty}
              protectedDoc={active && isProtected}
              streak={active ? streak : 0}
              onSelect={() => void switchToTab(path)}
              onClose={() => void closeTab(path)}
            />
          );
        })}
        {showBlankTab && (
          <Tab
            name={displayDocName(currentName) ?? "Sem título"}
            active
            dirty={dirty}
            protectedDoc={isProtected}
            streak={streak}
            onSelect={() => {}}
          />
        )}
        <button
          type="button"
          onClick={() => void newDocument()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Novo documento em branco"
          aria-label="Novo documento"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover shadow-md">
          <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="Abrir…" onClick={() => { setMenuOpen(false); void open(); }} />
          <MenuItem icon={<FilePlus2 className="h-4 w-4" />} label="Novo (em branco)" onClick={() => { setMenuOpen(false); void newDocument(); }} />
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

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function Tab({
  name,
  active,
  dirty,
  protectedDoc,
  streak,
  onSelect,
  onClose,
}: {
  name: string;
  active: boolean;
  dirty: boolean;
  protectedDoc: boolean;
  streak: number;
  onSelect: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition",
        active
          ? "border-primary/30 bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent/60"
      )}
    >
      <button type="button" onClick={onSelect} className="flex items-center gap-1" title={name}>
        {protectedDoc && <Lock className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Protegido" />}
        <span className="max-w-[150px] truncate">{name}</span>
        {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Não salvo" />}
        {active && streak > 0 && (
          <span
            className="ml-0.5 flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
            title={`${streak} dia${streak === 1 ? "" : "s"} seguidos de foco`}
          >
            <Flame className="h-3 w-3" />
            {streak}
          </span>
        )}
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
          title="Fechar aba"
          aria-label="Fechar aba"
        >
          <X className="h-3 w-3" />
        </button>
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
