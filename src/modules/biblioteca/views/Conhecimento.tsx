import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  FolderPlus,
  Lightbulb,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RichNoteEditor } from "../components/RichNoteEditor";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { promptDialog } from "@/components/ui/prompt";
import {
  backlinks,
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  getNote,
  listFolders,
  listNotes,
  listTags,
  moveNote,
  noteToIdea,
  notesByTag,
  renameFolder,
  saveNote,
  setPinned,
  type Note,
  type NoteFolder,
  type NoteRef,
  type NoteSummary,
} from "../notesApi";

type FolderFilter = number | "all" | "loose";

export function Conhecimento() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [filter, setFilter] = useState<FolderFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refreshLists = useCallback(async () => {
    const [f, t] = await Promise.all([listFolders(), listTags()]);
    setFolders(f);
    setTags(t);
    const list = tagFilter ? await notesByTag(tagFilter) : await listNotes(filter);
    setNotes(list);
  }, [filter, tagFilter]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  async function addFolder() {
    const name = await promptDialog({ title: "Nova pasta", placeholder: "Nome da pasta" });
    if (name == null) return;
    await createFolder(name);
    void refreshLists();
  }

  async function addNote() {
    const folderId = typeof filter === "number" ? filter : null;
    const id = await createNote(folderId);
    await refreshLists();
    setSelectedId(id);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* Coluna 1: pastas + lista de notas */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="flex-1" onClick={() => void addNote()}>
            <Plus className="mr-1 h-4 w-4" /> Nova nota
          </Button>
          <Button size="icon" variant="outline" onClick={() => void addFolder()} title="Nova pasta">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>

        {/* Pastas */}
        <div className="space-y-0.5 text-sm">
          <FolderRow label="Todas as notas" active={filter === "all" && !tagFilter} onClick={() => { setFilter("all"); setTagFilter(null); }} />
          <FolderRow label="Sem pasta" active={filter === "loose" && !tagFilter} onClick={() => { setFilter("loose"); setTagFilter(null); }} />
          {folders.map((f) => (
            <FolderRow
              key={f.id}
              label={f.name}
              active={filter === f.id && !tagFilter}
              onClick={() => { setFilter(f.id); setTagFilter(null); }}
              onRename={async () => {
                const name = await promptDialog({ title: "Renomear pasta", defaultValue: f.name });
                if (name == null) return;
                await renameFolder(f.id, name);
                void refreshLists();
              }}
              onDelete={async () => {
                if (!(await confirmDialog({ title: "Excluir pasta", description: `Excluir "${f.name}"? As notas dentro dela ficam sem pasta.`, confirmLabel: "Excluir", destructive: true }))) return;
                await deleteFolder(f.id);
                if (filter === f.id) setFilter("all");
                void refreshLists();
              }}
            />
          ))}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t pt-2">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => { setTagFilter(tagFilter === t ? null : t); }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  tagFilter === t ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <Tag className="h-3 w-3" />{t}
              </button>
            ))}
          </div>
        )}

        {/* Lista de notas */}
        <ul className="space-y-1 border-t pt-2">
          {notes.length === 0 ? (
            <li className="px-1 py-4 text-center text-xs text-muted-foreground">Nenhuma nota aqui.</li>
          ) : (
            notes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => setSelectedId(n.id)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    selectedId === n.id ? "bg-accent" : "hover:bg-muted/50"
                  )}
                >
                  {n.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" /> : null}
                  <span className="flex-1 truncate">{n.title || "(sem título)"}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Coluna 2: editor */}
      <div className="min-w-0">
        {selectedId == null ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Selecione ou crie uma nota.
          </div>
        ) : (
          <NoteEditor
            key={selectedId}
            noteId={selectedId}
            folders={folders}
            onChanged={() => void refreshLists()}
            onDeleted={() => { setSelectedId(null); void refreshLists(); }}
            onOpenNote={(id) => setSelectedId(id)}
            onIdea={() => navigate("/ideias")}
          />
        )}
      </div>
    </div>
  );
}

function FolderRow({
  label,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={cn("group flex items-center gap-1 rounded-md px-2 py-1", active ? "bg-accent" : "hover:bg-muted/50")}>
      <button onClick={onClick} className="flex flex-1 items-center gap-1.5 text-left">
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </button>
      {onRename && (
        <button onClick={onRename} className="opacity-0 transition group-hover:opacity-100" title="Renomear">
          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} className="opacity-0 transition group-hover:opacity-100" title="Excluir">
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </div>
  );
}

function NoteEditor({
  noteId,
  folders,
  onChanged,
  onDeleted,
  onOpenNote,
  onIdea,
}: {
  noteId: number;
  folders: NoteFolder[];
  onChanged: () => void;
  onDeleted: () => void;
  onOpenNote: (id: number) => void;
  onIdea: () => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState<NoteRef[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    void getNote(noteId).then((n) => {
      if (!alive || !n) return;
      setNote(n);
      setTitle(n.title);
      setBody(n.body);
      dirtyRef.current = false;
    });
    void backlinks(noteId).then((b) => alive && setLinks(b));
    return () => {
      alive = false;
    };
  }, [noteId]);

  const persist = useCallback(
    async (t: string, b: string) => {
      await saveNote(noteId, t, b);
      dirtyRef.current = false;
      const [bl] = await Promise.all([backlinks(noteId)]);
      setLinks(bl);
      onChanged();
    },
    [noteId, onChanged]
  );

  // Auto-save com debounce (a persistência no .vistage continua sendo o Ctrl+S).
  function scheduleSave(t: string, b: string) {
    dirtyRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(t, b), 700);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function flushSave() {
    if (!dirtyRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    void persist(title, body);
  }

  if (!note) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleSave(e.target.value, body); }}
          onBlur={flushSave}
          placeholder="Título da nota"
          className="flex-1 border-0 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/60"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={async () => { await setPinned(noteId, !note.pinned); setNote({ ...note, pinned: note.pinned ? 0 : 1 }); onChanged(); }}
          title={note.pinned ? "Desafixar" : "Fixar"}
        >
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            flushSave();
            const fresh = (await getNote(noteId)) ?? note;
            await noteToIdea(fresh);
            toast.success("Nota virou ideia — confira no Banco de Ideias");
            onIdea();
          }}
          title="Transformar em ideia"
        >
          <Lightbulb className="mr-1 h-4 w-4 text-amber-400" /> Virar ideia
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={async () => {
            if (!(await confirmDialog({ title: "Excluir nota", description: `Excluir "${title || "(sem título)"}"?`, confirmLabel: "Excluir", destructive: true }))) return;
            await deleteNote(noteId);
            onDeleted();
          }}
          title="Excluir nota"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Pasta */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Pasta:</span>
        <select
          value={note.folder_id ?? ""}
          onChange={async (e) => {
            const fid = e.target.value ? Number(e.target.value) : null;
            await moveNote(noteId, fid);
            setNote({ ...note, folder_id: fid });
            onChanged();
          }}
          className="rounded border bg-background px-1.5 py-0.5 text-xs"
        >
          <option value="">Sem pasta</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <RichNoteEditor
        value={body}
        onChange={(html) => { setBody(html); scheduleSave(title, html); }}
        onBlur={flushSave}
      />
      <p className="text-[11px] text-muted-foreground">
        Use <code>[[Título de outra nota]]</code> pra linkar e <code>#tag</code> pra marcar — continuam valendo no texto.
      </p>

      {/* Backlinks */}
      <div className="rounded-md border p-3">
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Mencionada em
        </div>
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">Nenhuma nota menciona esta ainda.</p>
        ) : (
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.id}>
                <button className="text-sm text-primary hover:underline" onClick={() => onOpenNote(l.id)}>
                  {l.title || "(sem título)"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
