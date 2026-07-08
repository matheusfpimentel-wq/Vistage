import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Lightbulb,
  List,
  Network,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings2,
  Tag,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { RichNoteEditor } from "../components/RichNoteEditor";
import { NoteMindMap } from "../components/NoteMindMap";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { useModuleView } from "@/lib/moduleView";
import { promptDialog } from "@/components/ui/prompt";
import {
  addManualLink,
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
  noteGraph,
  noteToIdea,
  notesByTag,
  removeManualLink,
  renameFolder,
  reorderFolders,
  saveNote,
  setNoteColor,
  setNoteGraphPos,
  setPinned,
  type Note,
  type NoteFolder,
  type NoteGraph,
  type NoteRef,
  type NoteSummary,
} from "../notesApi";

type FolderFilter = number | "all" | "loose";

// Paleta de cores das notas (espelha BLOCK_COLORS do Foco). NULL = sem cor.
const NOTE_COLORS = [
  "#ef4444", "#f59e0b", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
];

// Ocultar as "views rápidas" (Todas as notas / Sem pasta) é preferência LOCAL
// da máquina (não viaja no .vistage) — como useModuleView. Guardado à parte por
// serem duas flags.
const HIDDEN_VIEWS_KEY = "vistage.notes.hiddenViews";
type HiddenViews = { all: boolean; loose: boolean };
function loadHiddenViews(): HiddenViews {
  try {
    const raw = localStorage.getItem(HIDDEN_VIEWS_KEY);
    if (raw) return { all: false, loose: false, ...JSON.parse(raw) };
  } catch {
    /* storage indisponível */
  }
  return { all: false, loose: false };
}
function saveHiddenViews(v: HiddenViews): void {
  try {
    localStorage.setItem(HIDDEN_VIEWS_KEY, JSON.stringify(v));
  } catch {
    /* storage indisponível */
  }
}

export function Conhecimento() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [filter, setFilter] = useState<FolderFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [hidden, setHidden] = useState<HiddenViews>(loadHiddenViews);
  const [view, setView] = useModuleView<string>("conhecimento-view", "notas");
  const [graph, setGraph] = useState<NoteGraph>({ nodes: [], edges: [] });

  const loadGraph = useCallback(async () => {
    try {
      setGraph(await noteGraph());
    } catch (e) {
      toast.error(`Não consegui carregar o mapa: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (view === "mapa") void loadGraph();
  }, [view, loadGraph]);

  function toggleHiddenView(key: keyof HiddenViews) {
    setHidden((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveHiddenViews(next);
      // Se escondeu a view ativa, cai pra "Todas as notas" (ou a outra visível).
      if (next[key] && filter === key) setFilter(key === "all" ? "loose" : "all");
      return next;
    });
  }

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
    try {
      await createFolder(name);
      void refreshLists();
    } catch (e) {
      toast.error(`Não consegui criar a pasta: ${String(e)}`);
    }
  }

  async function addNote() {
    const folderId = typeof filter === "number" ? filter : null;
    try {
      const id = await createNote(folderId);
      await refreshLists();
      setSelectedId(id);
    } catch (e) {
      toast.error(`Não consegui criar a nota: ${String(e)}`);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Drag-and-drop: arrastar nota → pasta (move) ou "Sem pasta" (tira da pasta);
  // arrastar pasta sobre outra → reordena.
  async function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    if (activeId.startsWith("note:")) {
      const noteId = Number(activeId.slice(5));
      try {
        if (overId.startsWith("folder:")) {
          await moveNote(noteId, Number(overId.slice(7)));
          void refreshLists();
        } else if (overId === "drop:loose") {
          await moveNote(noteId, null);
          void refreshLists();
        }
      } catch (e) {
        toast.error(`Não consegui mover a nota: ${String(e)}`);
      }
      return;
    }

    if (activeId.startsWith("folder:") && overId.startsWith("folder:") && activeId !== overId) {
      const ids = folders.map((f) => f.id);
      const from = ids.indexOf(Number(activeId.slice(7)));
      const to = ids.indexOf(Number(overId.slice(7)));
      if (from < 0 || to < 0) return;
      const next = arrayMove(ids, from, to);
      setFolders((prev) => next.map((id) => prev.find((f) => f.id === id)!).filter(Boolean));
      try {
        await reorderFolders(next);
      } catch (e) {
        toast.error(`Não consegui reordenar as pastas: ${String(e)}`);
        void refreshLists();
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Alternar Notas | Mapa mental */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm">
          <button
            onClick={() => setView("notas")}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 transition-colors",
              view === "notas" ? "bg-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-3.5 w-3.5" /> Notas
          </button>
          <button
            onClick={() => setView("mapa")}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 transition-colors",
              view === "mapa" ? "bg-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Network className="h-3.5 w-3.5" /> Mapa
          </button>
        </div>
        {view === "mapa" && (
          <InfoHint>
            Arraste os nós pra organizar; a posição fica salva. Puxe pela alça (bolinha à
            direita do nó) até outra nota pra criar uma ligação. Clique num nó pra abrir a nota.
            As setas tracejadas vêm dos [[wikilinks]] do texto; as sólidas você desenhou aqui e
            têm "×" pra remover.
          </InfoHint>
        )}
      </div>

      {view === "mapa" ? (
        <NoteMindMap
          nodes={graph.nodes}
          edges={graph.edges}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setView("notas");
          }}
          onMove={(id, x, y) => void setNoteGraphPos(id, x, y)}
          onCreateLink={async (s, t) => {
            try {
              await addManualLink(s, t);
              await loadGraph();
            } catch (e) {
              toast.error(`Não consegui ligar as notas: ${String(e)}`);
            }
          }}
          onDeleteLink={async (s, t) => {
            try {
              await removeManualLink(s, t);
              await loadGraph();
            } catch (e) {
              toast.error(`Não consegui remover a ligação: ${String(e)}`);
            }
          }}
        />
      ) : (
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
          <Button
            size="icon"
            variant={configOpen ? "secondary" : "ghost"}
            onClick={() => setConfigOpen((o) => !o)}
            title="Configurar views rápidas"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Config das views rápidas: mostrar/ocultar "Todas as notas" e "Sem pasta". */}
        {configOpen && (
          <div className="space-y-1 rounded-md border p-2 text-xs">
            <div className="flex items-center gap-1 font-medium text-muted-foreground">
              Views rápidas
              <InfoHint>
                "Todas as notas" mostra tudo; "Sem pasta" mostra só as notas fora de qualquer
                pasta. Oculte as que você não usa pra enxugar a barra lateral (preferência da
                máquina, não vai no arquivo).
              </InfoHint>
            </div>
            {(["all", "loose"] as const).map((k) => (
              <button
                key={k}
                onClick={() => toggleHiddenView(k)}
                className="flex w-full items-center justify-between rounded px-1.5 py-1 hover:bg-muted/50"
              >
                <span>{k === "all" ? "Todas as notas" : "Sem pasta"}</span>
                {hidden[k] ? (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          {/* Pastas (arraste pra reordenar; solte uma nota numa pasta pra movê-la) */}
          <div className="space-y-0.5 text-sm">
            {!hidden.all && (
              <FolderRow label="Todas as notas" active={filter === "all" && !tagFilter} onClick={() => { setFilter("all"); setTagFilter(null); }} />
            )}
            {!hidden.loose && (
              <DroppableRow id="drop:loose">
                <FolderRow label="Sem pasta" active={filter === "loose" && !tagFilter} onClick={() => { setFilter("loose"); setTagFilter(null); }} />
              </DroppableRow>
            )}
            <SortableContext items={folders.map((f) => `folder:${f.id}`)} strategy={verticalListSortingStrategy}>
              {folders.map((f) => (
                <SortableFolder key={f.id} id={`folder:${f.id}`}>
                  <FolderRow
                    label={f.name}
                    active={filter === f.id && !tagFilter}
                    onClick={() => { setFilter(f.id); setTagFilter(null); }}
                    onRename={async () => {
                      const name = await promptDialog({ title: "Renomear pasta", defaultValue: f.name });
                      if (name == null) return;
                      try {
                        await renameFolder(f.id, name);
                        void refreshLists();
                      } catch (e) {
                        toast.error(`Não consegui renomear a pasta: ${String(e)}`);
                      }
                    }}
                    onDelete={async () => {
                      if (!(await confirmDialog({ title: "Excluir pasta", description: `Excluir "${f.name}"? As notas dentro dela ficam sem pasta.`, confirmLabel: "Excluir", destructive: true }))) return;
                      try {
                        await deleteFolder(f.id);
                        if (filter === f.id) setFilter("all");
                        void refreshLists();
                      } catch (e) {
                        toast.error(`Não consegui excluir a pasta: ${String(e)}`);
                      }
                    }}
                  />
                </SortableFolder>
              ))}
            </SortableContext>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1 border-t pt-2">
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

          {/* Lista de notas (arraste pra dentro de uma pasta) */}
          <ul className="mt-3 space-y-1 border-t pt-2">
            {notes.length === 0 ? (
              <li className="px-1 py-4 text-center text-xs text-muted-foreground">Nenhuma nota aqui.</li>
            ) : (
              notes.map((n) => (
                <DraggableNote key={n.id} id={`note:${n.id}`}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selectedId === n.id ? "bg-accent" : "hover:bg-muted/50"
                    )}
                  >
                    {n.color && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: n.color }}
                      />
                    )}
                    {n.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" /> : null}
                    <span className="flex-1 truncate">{n.title || "(sem título)"}</span>
                  </button>
                </DraggableNote>
              ))
            )}
          </ul>
        </DndContext>
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
      )}
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

/** Pasta arrastável (reordenar) e que recebe notas soltas (mover pra ela). */
function SortableFolder({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={cn("flex items-center gap-0.5 rounded-md", isOver && "ring-1 ring-primary/60")}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none px-0.5 text-muted-foreground/40 hover:text-muted-foreground"
        title="Arrastar pasta"
        aria-label="Arrastar pasta"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Nota arrastável (soltar numa pasta pra movê-la). Clicar continua selecionando. */
function DraggableNote({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      {children}
    </li>
  );
}

/** Alvo de drop (ex.: "Sem pasta") destacado quando uma nota paira sobre ele. */
function DroppableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("rounded-md", isOver && "ring-1 ring-primary/60")}>
      {children}
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
  const [colorOpen, setColorOpen] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);

  async function applyColor(color: string | null) {
    try {
      await setNoteColor(noteId, color);
      setNote((n) => (n ? { ...n, color } : n));
      setColorOpen(false);
      onChanged();
    } catch (e) {
      toast.error(`Não consegui salvar a cor: ${String(e)}`);
    }
  }

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
      try {
        await saveNote(noteId, t, b);
        dirtyRef.current = false;
        const [bl] = await Promise.all([backlinks(noteId)]);
        setLinks(bl);
        onChanged();
      } catch (e) {
        toast.error(`Não consegui salvar a nota: ${String(e)}`);
      }
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
          onClick={() => setColorOpen((o) => !o)}
          title="Cor da nota"
        >
          <Palette className="h-4 w-4" style={note.color ? { color: note.color } : undefined} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={async () => {
            try {
              await setPinned(noteId, !note.pinned);
              setNote({ ...note, pinned: note.pinned ? 0 : 1 });
              onChanged();
            } catch (e) {
              toast.error(`Não consegui fixar a nota: ${String(e)}`);
            }
          }}
          title={note.pinned ? "Desafixar" : "Fixar"}
        >
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            flushSave();
            try {
              const fresh = (await getNote(noteId)) ?? note;
              await noteToIdea(fresh);
              toast.success("Nota virou ideia. Confira no Banco de Ideias");
              onIdea();
            } catch (e) {
              toast.error(`Não consegui transformar a nota em ideia: ${String(e)}`);
            }
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
            try {
              await deleteNote(noteId);
              onDeleted();
            } catch (e) {
              toast.error(`Não consegui excluir a nota: ${String(e)}`);
            }
          }}
          title="Excluir nota"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Seletor de cor da nota (aparece no lápis de paleta) */}
      {colorOpen && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
          <button
            onClick={() => void applyColor(null)}
            title="Sem cor"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs text-muted-foreground transition",
              !note.color ? "ring-2 ring-foreground" : "hover:border-muted-foreground/40"
            )}
          >
            —
          </button>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => void applyColor(c)}
              title={c}
              aria-label={`Cor ${c}`}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition",
                note.color === c ? "border-foreground" : "border-transparent hover:border-muted-foreground/40"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {/* Pasta */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Pasta:</span>
        <select
          value={note.folder_id ?? ""}
          onChange={async (e) => {
            const fid = e.target.value ? Number(e.target.value) : null;
            try {
              await moveNote(noteId, fid);
              setNote({ ...note, folder_id: fid });
              onChanged();
            } catch (err) {
              toast.error(`Não consegui mover a nota: ${String(err)}`);
            }
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
        Use <code>[[Título de outra nota]]</code> pra linkar e <code>#tag</code> pra marcar; continuam valendo no texto.
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
