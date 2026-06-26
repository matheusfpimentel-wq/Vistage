import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, FolderOpen, Link2, Link2Off, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { connectDrive, isDriveConnected } from "@/lib/gdrive";
import {
  associateDoc,
  deleteDoc,
  gigOptions,
  getDocFolderId,
  linksForDoc,
  listFolderDocs,
  openDoc,
  removeLink,
  setDocFolderId,
  uploadDocsToFolder,
  type DocLink,
  type DriveFile,
  type EntityRef,
} from "../documents/api";

export function Documentos() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderInput, setFolderInput] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gigs, setGigs] = useState<EntityRef[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void isDriveConnected().then(setConnected);
    void getDocFolderId().then((id) => {
      setFolderId(id);
      setFolderInput(id ?? "");
    });
    void gigOptions().then(setGigs);
  }, []);

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
    await setDocFolderId(id || null);
    setFolderId(id || null);
    if (!id) setFiles([]);
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
          <label className="text-xs font-medium text-muted-foreground">ID da pasta no Drive</label>
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
        <Button size="sm" variant="ghost" onClick={() => void connect()} title="Reconectar (novo consentimento — leitura e escrita)">
          Reconectar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A pasta é a fonte (modelos, contratos anteriores). Associar a um evento é o vínculo local.
        O ID é a parte final da URL <code>drive.google.com/drive/folders/<strong>ID</strong></code>.
      </p>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}

      {!folderId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Defina o ID da pasta pra listar os documentos.</p>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">Carregando…</p>
      ) : files.length === 0 && !error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Pasta vazia (ou sem acesso).</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <DocRow
              key={f.id}
              file={f}
              gigs={gigs}
              expanded={openFile === f.id}
              onToggle={() => setOpenFile(openFile === f.id ? null : f.id)}
              onDelete={() => void handleDelete(f)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function isFolder(mime: string): boolean {
  return mime === "application/vnd.google-apps.folder";
}

function DocRow({
  file,
  gigs,
  expanded,
  onToggle,
  onDelete,
}: {
  file: DriveFile;
  gigs: EntityRef[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [links, setLinks] = useState<DocLink[]>([]);
  const [gigId, setGigId] = useState<string>("");

  const reloadLinks = useCallback(() => {
    void linksForDoc(file.id).then(setLinks);
  }, [file.id]);

  useEffect(() => {
    if (expanded) reloadLinks();
  }, [expanded, reloadLinks]);

  async function link() {
    if (!gigId) return;
    const g = gigs.find((x) => String(x.id) === gigId);
    if (!g) return;
    await associateDoc(file, "gig", g.id);
    setGigId("");
    reloadLinks();
    toast.success("Documento associado à GIG.");
  }

  return (
    <li className="rounded-md border">
      <div className="flex items-center gap-2 p-2.5">
        <FileText className={"h-4 w-4 shrink-0 " + (isFolder(file.mime_type) ? "text-amber-500" : "text-muted-foreground")} />
        <button className="flex-1 truncate text-left text-sm hover:underline" onClick={onToggle} title={file.name}>
          {file.name}
        </button>
        {file.web_view_link && (
          <button className="text-primary" title="Abrir no Drive" onClick={() => void openDoc(file.web_view_link)}>
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
        {!isFolder(file.mime_type) && (
          <button className="text-muted-foreground hover:text-foreground" title="Associar a uma GIG" onClick={onToggle}>
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
                  <span className="flex-1 truncate">Vinculado a: <strong>{l.label}</strong></span>
                  <button className="text-muted-foreground hover:text-destructive" onClick={async () => { await removeLink(l.id); reloadLinks(); }}>
                    <Link2Off className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <select className="h-8 flex-1 rounded-md border bg-background px-2 text-sm" value={gigId} onChange={(e) => setGigId(e.target.value)}>
              <option value="">Associar a uma GIG…</option>
              {gigs.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-8" disabled={!gigId} onClick={() => void link()}>Vincular</Button>
          </div>
        </div>
      )}
    </li>
  );
}
