import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderPlus,
  Link2,
  Link2Off,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { connectDrive, isDriveConnected } from "@/lib/gdrive";
import { ENTITY_LINK_LABELS, ENTITY_LINK_TYPES, type EntityLinkType, type EntityOption } from "@/lib/entityLinks";
import {
  associateDoc,
  createDocGroup,
  deleteDoc,
  deleteDocGroup,
  entityOptions,
  getDocFolderId,
  groupMemberships,
  linksForDoc,
  listDocGroups,
  listFolderDocs,
  openDoc,
  removeLink,
  renameDocGroup,
  setDocFolderId,
  setDocGroup,
  uploadDocsToFolder,
  type DocGroup,
  type DocLink,
  type DriveFile,
} from "../documents/api";

export function Documentos() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Grupos LOCAIS (não tocam no Drive): document_groups + membership por drive_file_id.
  const [groups, setGroups] = useState<DocGroup[]>([]);
  const [memberships, setMemberships] = useState<Record<string, number>>({});

  const reloadGroups = useCallback(async () => {
    const [gs, mem] = await Promise.all([listDocGroups(), groupMemberships()]);
    setGroups(gs);
    setMemberships(mem);
  }, []);

  useEffect(() => {
    void isDriveConnected().then(setConnected);
    void getDocFolderId().then((id) => {
      setFolderId(id);
      setFolderInput(id ?? "");
    });
    void reloadGroups();
  }, [reloadGroups]);

  const loadFiles = useCallback(async (fid: string) => {
    setLoading(true);
    setError(null);
    try {
      setFiles(await listFolderDocs(fid));
    } catch (e) {
      setError(
        "Não consegui listar a pasta. Se você conectou o Drive antes desta versão, é preciso " +
          "RECONECTAR (o acesso de leitura é um consentimento novo). Detalhe: " +
          String(e)
      );
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (folderId) void loadFiles(folderId);
  }, [folderId, loadFiles]);

  async function connect() {
    try {
      await connectDrive();
      setConnected(true);
      toast.success("Google Drive conectado.");
      if (folderId) void loadFiles(folderId);
    } catch (e) {
      toast.error("Falha ao conectar: " + String(e));
    }
  }

  async function saveFolder() {
    const id = folderInput.trim();
    try {
      await setDocFolderId(id || null);
      setFolderId(id || null);
      if (!id) setFiles([]);
    } catch (e) {
      toast.error(`Não consegui salvar a pasta: ${String(e)}`);
    }
  }

  async function handleUpload() {
    if (!folderId) return;
    setUploading(true);
    try {
      const n = await uploadDocsToFolder(folderId);
      if (n > 0) {
        toast.success(`${n} arquivo(s) enviado(s) ao Drive.`);
        void loadFiles(folderId);
      }
    } catch (e) {
      toast.error(
        "Falha ao enviar. Se conectou o Drive antes desta versão, RECONECTE (escrita é um " +
          "consentimento novo). Detalhe: " + String(e)
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(f: DriveFile) {
    if (
      !(await confirmDialog({
        title: "Excluir do Drive",
        description: `Excluir "${f.name}" do Google Drive? A ação é permanente.`,
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    try {
      await deleteDoc(f.id);
      toast.success("Arquivo excluído.");
      if (folderId) void loadFiles(folderId);
    } catch (e) {
      toast.error("Falha ao excluir (reconecte se necessário). Detalhe: " + String(e));
    }
  }

  // Move um arquivo pra um grupo (ou tira dele). Atualiza local sem recarregar tudo.
  async function assignGroup(fileId: string, groupId: number | null) {
    try {
      await setDocGroup(fileId, groupId);
      setMemberships((prev) => {
        const next = { ...prev };
        if (groupId == null) delete next[fileId];
        else next[fileId] = groupId;
        return next;
      });
    } catch (e) {
      toast.error(`Não consegui mover pro grupo: ${String(e)}`);
    }
  }

  if (connected === false) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
        <div className="text-sm font-medium">Conecte o Google Drive</div>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Liste, envie e exclua arquivos numa pasta designada (contratos, modelos, rider).
        </p>
        <Button size="sm" className="mt-3" onClick={() => void connect()}>
          Conectar Google Drive
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            ID da pasta no Drive
            <InfoHint>
              A pasta é a fonte (modelos, contratos anteriores). Associar a um evento é o vínculo
              local. O ID é a parte final da URL drive.google.com/drive/folders/ID.
            </InfoHint>
          </label>
          <input
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            placeholder="Cole o ID da pasta (da URL do Drive)…"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => void saveFolder()}>Salvar pasta</Button>
        {folderId && (
          <>
            <Button size="sm" variant="outline" onClick={() => void handleUpload()} disabled={uploading}>
              <Upload className="mr-1.5 h-4 w-4" /> {uploading ? "Enviando…" : "Enviar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void loadFiles(folderId)} disabled={loading}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => void connect()} title="Reconectar (novo consentimento: leitura e escrita)">
          Reconectar
        </Button>
      </div>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}

      {!folderId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Defina o ID da pasta pra listar os documentos.</p>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">Carregando…</p>
      ) : files.length === 0 && !error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Pasta vazia (ou sem acesso).</p>
      ) : (
        <GroupedDocs
          files={files}
          groups={groups}
          memberships={memberships}
          openFile={openFile}
          onToggleFile={(id) => setOpenFile(openFile === id ? null : id)}
          onDelete={(f) => void handleDelete(f)}
          onAssignGroup={(fileId, gid) => void assignGroup(fileId, gid)}
          onGroupsChanged={() => void reloadGroups()}
        />
      )}
    </div>
  );
}

/** Lista dividida em seções por grupo (Sem grupo primeiro). Sem grupos criados,
 *  cai numa lista plana + a barra pra criar o 1º grupo. */
function GroupedDocs({
  files,
  groups,
  memberships,
  openFile,
  onToggleFile,
  onDelete,
  onAssignGroup,
  onGroupsChanged,
}: {
  files: DriveFile[];
  groups: DocGroup[];
  memberships: Record<string, number>;
  openFile: string | null;
  onToggleFile: (id: string) => void;
  onDelete: (f: DriveFile) => void;
  onAssignGroup: (fileId: string, groupId: number | null) => void;
  onGroupsChanged: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g] as const)), [groups]);

  // Grupo efetivo de um arquivo (membership órfã — grupo excluído — vira "sem grupo").
  const effGroup = useCallback(
    (fileId: string): number | null => {
      const m = memberships[fileId];
      return m != null && groupById.has(m) ? m : null;
    },
    [memberships, groupById]
  );

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function createGroup() {
    const name = newName.trim();
    setNewOpen(false);
    setNewName("");
    if (!name) return;
    try {
      await createDocGroup(name);
      onGroupsChanged();
    } catch (e) {
      toast.error(`Não consegui criar o grupo: ${String(e)}`);
    }
  }

  async function saveRename(id: number) {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      await renameDocGroup(id, name);
      onGroupsChanged();
    } catch (e) {
      toast.error(`Não consegui renomear: ${String(e)}`);
    }
  }

  async function removeGroup(g: DocGroup, count: number) {
    if (
      count > 0 &&
      !(await confirmDialog({
        title: `Excluir grupo "${g.name}"`,
        description: `Os ${count} documento(s) voltam para "Sem grupo". Nada é apagado do Drive.`,
        confirmLabel: "Excluir grupo",
        destructive: true,
      }))
    )
      return;
    try {
      await deleteDocGroup(g.id);
      onGroupsChanged();
    } catch (e) {
      toast.error(`Não consegui excluir o grupo: ${String(e)}`);
    }
  }

  const sections: { key: string; id: number | null; name: string }[] = [
    { key: "none", id: null, name: "Sem grupo" },
    ...groups.map((g) => ({ key: `g${g.id}`, id: g.id, name: g.name })),
  ];

  const renderFiles = (secFiles: DriveFile[]) => (
    <ul className="space-y-1.5">
      {secFiles.map((f) => (
        <DocRow
          key={f.id}
          file={f}
          groups={groups}
          groupId={effGroup(f.id)}
          expanded={openFile === f.id}
          onToggle={() => onToggleFile(f.id)}
          onDelete={() => onDelete(f)}
          onSetGroup={(gid) => onAssignGroup(f.id, gid)}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-2">
      {/* Barra de grupos */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Grupos</span>
        {newOpen ? (
          <input
            autoFocus
            className="h-7 w-40 rounded-md border bg-background px-2 text-sm"
            placeholder="Nome do grupo…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createGroup();
              if (e.key === "Escape") {
                setNewOpen(false);
                setNewName("");
              }
            }}
            onBlur={() => void createGroup()}
          />
        ) : (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setNewOpen(true)}>
            <FolderPlus className="mr-1.5 h-4 w-4" /> Novo grupo
          </Button>
        )}
      </div>

      {/* Sem grupos criados: lista plana */}
      {groups.length === 0
        ? renderFiles(files)
        : sections.map((sec) => {
            const secFiles = files.filter((f) => effGroup(f.id) === sec.id);
            // "Sem grupo" some quando vazio (só ruído); grupos sempre aparecem.
            if (sec.id === null && secFiles.length === 0) return null;
            const isCollapsed = collapsed.has(sec.key);
            const g = sec.id != null ? groupById.get(sec.id) : undefined;
            return (
              <section key={sec.key} className="overflow-hidden rounded-md border">
                <header className="flex items-center gap-1.5 bg-muted/40 px-2 py-1.5">
                  <button
                    className="flex flex-1 items-center gap-1.5 text-left"
                    onClick={() => toggle(sec.key)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    {editingId === sec.id && g ? null : (
                      <span className="text-sm font-medium">{sec.name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{secFiles.length}</span>
                  </button>
                  {g && editingId === g.id && (
                    <input
                      autoFocus
                      className="h-7 w-40 rounded-md border bg-background px-2 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(g.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => void saveRename(g.id)}
                    />
                  )}
                  {g && editingId !== g.id && (
                    <>
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        title="Renomear grupo"
                        onClick={() => {
                          setEditingId(g.id);
                          setEditName(g.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        title="Excluir grupo"
                        onClick={() => void removeGroup(g, secFiles.length)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </header>
                {!isCollapsed && (
                  <div className="p-2">
                    {secFiles.length === 0 ? (
                      <p className="px-1 py-1 text-xs text-muted-foreground">Vazio.</p>
                    ) : (
                      renderFiles(secFiles)
                    )}
                  </div>
                )}
              </section>
            );
          })}
    </div>
  );
}

function isFolder(mime: string): boolean {
  return mime === "application/vnd.google-apps.folder";
}

function DocRow({
  file,
  groups,
  groupId,
  expanded,
  onToggle,
  onDelete,
  onSetGroup,
}: {
  file: DriveFile;
  groups: DocGroup[];
  groupId: number | null;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSetGroup: (groupId: number | null) => void;
}) {
  const [links, setLinks] = useState<DocLink[]>([]);
  // Seletor Tipo → Entidade (vínculo polimórfico a qualquer entidade).
  const [kind, setKind] = useState<EntityLinkType | "">("");
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [entityId, setEntityId] = useState<string>("");

  const reloadLinks = useCallback(() => {
    void linksForDoc(file.id).then(setLinks);
  }, [file.id]);

  useEffect(() => {
    if (expanded) reloadLinks();
  }, [expanded, reloadLinks]);

  // Carrega as opções ao escolher o tipo.
  useEffect(() => {
    setEntityId("");
    if (!kind) {
      setOptions([]);
      return;
    }
    setLoadingOptions(true);
    void entityOptions(kind)
      .then(setOptions)
      .finally(() => setLoadingOptions(false));
  }, [kind]);

  async function link() {
    if (!kind || !entityId) return;
    const opt = options.find((o) => String(o.id) === entityId);
    if (!opt) return;
    try {
      await associateDoc(file, kind, opt.id, opt.label);
      setEntityId("");
      reloadLinks();
      toast.success(`Documento associado a ${ENTITY_LINK_LABELS[kind]}.`);
    } catch (e) {
      toast.error(`Não consegui associar o documento: ${String(e)}`);
    }
  }

  const canGroup = !isFolder(file.mime_type) && groups.length > 0;

  return (
    <li className="rounded-md border">
      <div className="flex items-center gap-2 p-2.5">
        <FileText className={"h-4 w-4 shrink-0 " + (isFolder(file.mime_type) ? "text-amber-500" : "text-muted-foreground")} />
        <button className="flex-1 truncate text-left text-sm hover:underline" onClick={onToggle} title={file.name}>
          {file.name}
        </button>
        {canGroup && (
          <select
            className="h-7 max-w-[9rem] rounded-md border bg-background px-1.5 text-xs text-muted-foreground"
            title="Grupo"
            value={groupId ?? ""}
            onChange={(e) => onSetGroup(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        {file.web_view_link && (
          <button className="text-primary" title="Abrir no Drive" onClick={() => void openDoc(file.web_view_link)}>
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
        {!isFolder(file.mime_type) && (
          <button className="text-muted-foreground hover:text-foreground" title="Vincular a uma entidade" onClick={onToggle}>
            <Link2 className="h-4 w-4" />
          </button>
        )}
        {!isFolder(file.mime_type) && (
          <button className="text-muted-foreground hover:text-destructive" title="Excluir do Drive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {expanded && !isFolder(file.mime_type) && (
        <div className="space-y-2 border-t p-2.5">
          {links.length > 0 && (
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">
                    Vinculado a{" "}
                    <span className="text-muted-foreground">
                      {entityKindLabel(l.entity_type)}
                    </span>{" "}
                    <strong>{l.label}</strong>
                  </span>
                  <button className="text-muted-foreground hover:text-destructive" onClick={async () => {
                    try {
                      await removeLink(l.id);
                      reloadLinks();
                    } catch (e) {
                      toast.error(`Não consegui remover o vínculo: ${String(e)}`);
                    }
                  }}>
                    <Link2Off className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <select
              className="h-8 w-32 rounded-md border bg-background px-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as EntityLinkType | "")}
            >
              <option value="">Tipo…</option>
              {ENTITY_LINK_TYPES.map((t) => (
                <option key={t} value={t}>{ENTITY_LINK_LABELS[t]}</option>
              ))}
            </select>
            <select
              className="h-8 flex-1 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              disabled={!kind || loadingOptions}
            >
              <option value="">{loadingOptions ? "Carregando…" : "Selecione…"}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-8" disabled={!kind || !entityId} onClick={() => void link()}>Vincular</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Rótulo curto do tipo da entidade (para o "Vinculado a Festa X"). */
function entityKindLabel(type: string): string {
  return type in ENTITY_LINK_LABELS ? ENTITY_LINK_LABELS[type as EntityLinkType] : type;
}
