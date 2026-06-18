import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, Loader2, Save, SaveAll } from "lucide-react";
import { useDocumentStore, displayDocName } from "@/lib/document";
import { hasAnyDocumentData } from "@/lib/backup";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

/**
 * Menu "Arquivo" no estilo Office: Abrir / Salvar / Salvar como, operando
 * sobre um arquivo .vistage local e portátil que carrega TODOS os dados e
 * anexos.
 */
export function FileMenu() {
  const { currentName, busy, dirty, open, save, saveAs } = useDocumentStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleOpen() {
    setMenuOpen(false);
    // App em branco → não há dados a substituir, abre direto.
    const hasData = await hasAnyDocumentData().catch(() => true);
    if (hasData) {
      const ok = await confirmDialog({
        title: "Abrir documento",
        description:
          "Abrir um arquivo .vistage SUBSTITUI todos os dados atuais pelos do arquivo. " +
          "Salve o estado atual antes se quiser preservá-lo. Continuar?",
        confirmLabel: "Abrir",
      });
      if (!ok) return;
    }
    void open();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition",
          "text-muted-foreground hover:bg-accent hover:text-foreground",
          menuOpen && "bg-accent text-foreground"
        )}
        title={
          (currentName ? `Documento: ${displayDocName(currentName)}` : "Nenhum documento aberto") +
          (dirty ? " • alterações não salvas" : "")
        }
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline max-w-[160px] truncate">
          {displayDocName(currentName) ?? "Arquivo"}
        </span>
        {dirty && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            aria-label="Alterações não salvas"
          />
        )}
      </button>

      {menuOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-md border bg-popover shadow-md">
          <MenuItem icon={<FolderOpen className="h-4 w-4" />} label="Abrir…" onClick={handleOpen} />
          <MenuItem
            icon={<Save className="h-4 w-4" />}
            label="Salvar"
            shortcut="Ctrl S"
            onClick={() => {
              setMenuOpen(false);
              void save();
            }}
          />
          <MenuItem
            icon={<SaveAll className="h-4 w-4" />}
            label="Salvar como…"
            onClick={() => {
              setMenuOpen(false);
              void saveAs();
            }}
          />
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
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
