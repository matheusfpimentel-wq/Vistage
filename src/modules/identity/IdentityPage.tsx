import { useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  Clipboard,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Type,
  Video,
  X,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { open as openShell } from "@tauri-apps/plugin-shell";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  loadIdentity,
  saveIdentity,
} from "./api";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { formatDate } from "@/lib/format";
import {
  SOCIAL_NETWORKS,
  TEMPLATE_CATEGORIES,
  type ArtistIdentity,
  type ArtistTemplate,
  type FolderLink,
  type IdentityPhoto,
  type SocialLink,
  type SocialNetwork,
  type TemplateCategory,
} from "./types";
import {
  IMAGE_EXTS,
  VIDEO_EXTS,
  deleteAttachment,
  pickFile,
  saveAttachment,
  useImageUrl,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";

export function IdentityPage() {
  const [identity, setIdentity] = useState<ArtistIdentity | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [templates, setTemplates] = useState<ArtistTemplate[]>([]);
  const [flyerGigs, setFlyerGigs] = useState<Gig[]>([]);
  const [tplFormOpen, setTplFormOpen] = useState(false);

  async function refresh() {
    const [id, tpls, allGigs] = await Promise.all([
      loadIdentity(),
      listTemplates(),
      listGigs(),
    ]);
    setIdentity(id);
    setDirty(false);
    setTemplates(tpls);
    setFlyerGigs(
      allGigs
        .filter((g) => !!g.banner_file_path)
        .sort((a, b) => b.date.localeCompare(a.date))
    );
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Auto-save ao sair da página: mantemos refs com o estado mais recente e,
  // no cleanup do efeito (desmontagem do componente), persistimos se houver
  // alterações não salvas. Substitui o antigo guard com useBlocker, que exige
  // data router e quebrava a página com BrowserRouter (tela branca).
  const identityRef = useRef(identity);
  const dirtyRef = useRef(dirty);
  identityRef.current = identity;
  dirtyRef.current = dirty;

  useEffect(() => {
    return () => {
      if (!dirtyRef.current || !identityRef.current) return;
      const i = identityRef.current;
      void saveIdentity({
        artist_name: i.artist_name,
        bio_short: i.bio_short,
        bio_long: i.bio_long,
        socials: i.socials,
        logo_path: i.logo_path,
        isotype_path: i.isotype_path,
        presskit_path: i.presskit_path,
        presskit_link: i.presskit_link,
        brand_manual_path: i.brand_manual_path,
        palette: i.palette,
        fonts: i.fonts,
        photos: i.photos,
        folder_links: i.folder_links,
        notes: i.notes,
      }).catch(() => {
        /* silencioso — saída de página não pode interromper navegação */
      });
    };
  }, []);

  if (!identity) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  function set<K extends keyof ArtistIdentity>(
    key: K,
    value: ArtistIdentity[K]
  ) {
    setIdentity((i) => (i ? { ...i, [key]: value } : i));
    setDirty(true);
  }

  async function handleSave() {
    if (!identity) return;
    setSaving(true);
    try {
      await saveIdentity({
        artist_name: identity.artist_name,
        bio_short: identity.bio_short,
        bio_long: identity.bio_long,
        socials: identity.socials,
        logo_path: identity.logo_path,
        isotype_path: identity.isotype_path,
        presskit_path: identity.presskit_path,
        presskit_link: identity.presskit_link,
        brand_manual_path: identity.brand_manual_path,
        palette: identity.palette,
        fonts: identity.fonts,
        photos: identity.photos,
        folder_links: identity.folder_links,
        notes: identity.notes,
      });
      toast.success("Identidade salva");
      setDirty(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function addSocial(network: SocialNetwork) {
    if (!identity) return;
    if (identity.socials.some((s) => s.network === network)) return;
    set("socials", [...identity.socials, { network, handle: "", url: "" }]);
  }

  function updateSocial(idx: number, patch: Partial<SocialLink>) {
    if (!identity) return;
    const next = [...identity.socials];
    next[idx] = { ...next[idx], ...patch };
    set("socials", next);
  }

  function removeSocial(idx: number) {
    if (!identity) return;
    set(
      "socials",
      identity.socials.filter((_, i) => i !== idx)
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Identidade</TabsTrigger>
          <TabsTrigger value="photos">Galeria ({identity.photos.length})</TabsTrigger>
          <TabsTrigger value="flyers">Flyers ({flyerGigs.length})</TabsTrigger>
          <TabsTrigger value="templates">
            Templates ({templates.length})
          </TabsTrigger>
        </TabsList>

        {/* ====================== IDENTIDADE ====================== */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Quem você é
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome artístico</Label>
                <Input
                  value={identity.artist_name ?? ""}
                  onChange={(e) =>
                    set("artist_name", e.target.value || null)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Briefing rápido</Label>
                <Textarea
                  rows={2}
                  value={identity.bio_short ?? ""}
                  onChange={(e) => set("bio_short", e.target.value || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Briefing completo / bio longa</Label>
                <Textarea
                  rows={6}
                  value={identity.bio_long ?? ""}
                  onChange={(e) => set("bio_long", e.target.value || null)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  Paleta de cores
                </Label>
                <div className="flex flex-wrap gap-2">
                  {identity.palette.map((color, idx) => (
                    <div
                      key={idx}
                      className="group relative flex items-center gap-2 rounded-md border bg-card p-2"
                    >
                      <input
                        type="color"
                        value={color.hex}
                        onChange={(e) => {
                          const next = [...identity.palette];
                          next[idx] = { ...next[idx], hex: e.target.value };
                          set("palette", next);
                        }}
                        className="h-10 w-10 cursor-pointer rounded border-0 p-0"
                        aria-label="Mudar cor"
                      />
                      <div className="flex flex-col gap-1">
                        <Input
                          value={color.label ?? ""}
                          placeholder="Rótulo (opcional)"
                          onChange={(e) => {
                            const next = [...identity.palette];
                            next[idx] = {
                              ...next[idx],
                              label: e.target.value || undefined,
                            };
                            set("palette", next);
                          }}
                          className="h-7 w-32 text-xs"
                        />
                        <Input
                          value={color.hex}
                          onChange={(e) => {
                            const next = [...identity.palette];
                            next[idx] = { ...next[idx], hex: e.target.value };
                            set("palette", next);
                          }}
                          className="h-7 w-32 font-mono text-xs tabular-nums"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          set(
                            "palette",
                            identity.palette.filter((_, i) => i !== idx)
                          );
                        }}
                        aria-label="Remover cor"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      set("palette", [
                        ...identity.palette,
                        { hex: "#7c3aed", label: "" },
                      ])
                    }
                    className="flex h-[68px] items-center gap-1.5 rounded-md border-2 border-dashed px-3 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    Nova cor
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" />
                  Fontes (tipografia)
                </Label>
                <div className="space-y-2">
                  {identity.fonts.map((font, idx) => (
                    <div key={idx} className="space-y-2 rounded-md border p-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={font.name}
                          placeholder="Nome da fonte (ex: Clash Display)"
                          onChange={(e) => {
                            const next = [...identity.fonts];
                            next[idx] = { ...next[idx], name: e.target.value };
                            set("fonts", next);
                          }}
                          className="flex-1"
                          style={{ fontFamily: font.name || undefined }}
                        />
                        <Input
                          value={font.role ?? ""}
                          placeholder="Uso (Títulos, Corpo…)"
                          onChange={(e) => {
                            const next = [...identity.fonts];
                            next[idx] = {
                              ...next[idx],
                              role: e.target.value || undefined,
                            };
                            set("fonts", next);
                          }}
                          className="w-40"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            set(
                              "fonts",
                              identity.fonts.filter((_, i) => i !== idx)
                            )
                          }
                          aria-label="Remover fonte"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <AttachmentField
                        label="Arquivo da fonte"
                        value={font.file_path ?? null}
                        onChange={(v) => {
                          const next = [...identity.fonts];
                          next[idx] = { ...next[idx], file_path: v };
                          set("fonts", next);
                        }}
                        subdir="fonts"
                        variant="document"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      set("fonts", [...identity.fonts, { name: "", role: "", file_path: null }])
                    }
                    className="flex items-center gap-1.5 rounded-md border-2 border-dashed px-3 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    Nova fonte
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <AttachmentField
                  label="Logotipo (texto + símbolo)"
                  value={identity.logo_path}
                  onChange={(v) => set("logo_path", v)}
                  subdir="identity/logo"
                  variant="image"
                />
                <AttachmentField
                  label="Isótipo (só símbolo)"
                  value={identity.isotype_path}
                  onChange={(v) => set("isotype_path", v)}
                  subdir="identity/isotype"
                  variant="image"
                />
                <AttachmentField
                  label="Presskit (PDF)"
                  value={identity.presskit_path}
                  onChange={(v) => set("presskit_path", v)}
                  subdir="identity/presskit"
                  variant="document"
                />
              </div>

              <AttachmentField
                label="Manual de marca (PDF)"
                value={identity.brand_manual_path}
                onChange={(v) => set("brand_manual_path", v)}
                subdir="identity/brand-manual"
                variant="document"
              />

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <LinkIcon className="h-3.5 w-3.5" />
                  Presskit (link)
                </Label>
                <Input
                  type="url"
                  placeholder="https://… (Notion, Drive, site…)"
                  value={identity.presskit_link ?? ""}
                  onChange={(e) => set("presskit_link", e.target.value || null)}
                />
                {identity.presskit_link && (
                  <button
                    type="button"
                    onClick={() =>
                      openShell(identity.presskit_link!).catch(() => {})
                    }
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir presskit
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Notas internas</Label>
                <Textarea
                  rows={2}
                  placeholder="Tagline, posicionamento, referências visuais…"
                  value={identity.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value || null)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Redes sociais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {SOCIAL_NETWORKS.filter(
                  (n) => !identity.socials.some((s) => s.network === n)
                ).map((n) => (
                  <button
                    key={n}
                    onClick={() => addSocial(n)}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    {n}
                  </button>
                ))}
              </div>

              {identity.socials.length > 0 && (
                <div className="space-y-2">
                  {identity.socials.map((s, idx) => (
                    <div
                      key={s.network + idx}
                      className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[140px_1fr_1fr_auto]"
                    >
                      {s.network === "Outro" ? (
                        <Input
                          placeholder="Nome da rede"
                          className="text-xs"
                          value=""
                          onChange={(e) =>
                            updateSocial(idx, { network: e.target.value })
                          }
                        />
                      ) : !SOCIAL_NETWORKS.includes(s.network as (typeof SOCIAL_NETWORKS)[number]) ? (
                        <Input
                          className="text-xs"
                          value={s.network}
                          onChange={(e) =>
                            updateSocial(idx, { network: e.target.value || "Outro" })
                          }
                        />
                      ) : (
                        <Badge
                          variant="secondary"
                          className="justify-start truncate"
                        >
                          {s.network}
                        </Badge>
                      )}
                      <Input
                        placeholder="@handle"
                        value={s.handle}
                        onChange={(e) =>
                          updateSocial(idx, { handle: e.target.value })
                        }
                      />
                      <Input
                        placeholder="https://..."
                        value={s.url}
                        onChange={(e) =>
                          updateSocial(idx, { url: e.target.value })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSocial(idx)}
                        aria-label="Remover"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="sticky bottom-4 flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar identidade
            </Button>
          </div>
        </TabsContent>

        {/* ====================== FOTOS ====================== */}
        <TabsContent value="photos" className="space-y-4">
          <PhotosTab
            photos={identity.photos}
            folderLinks={identity.folder_links}
            artistName={identity.artist_name}
            onPhotosChange={(p) => set("photos", p)}
            onFolderLinksChange={(l) => set("folder_links", l)}
          />
        </TabsContent>

        {/* ====================== TEMPLATES ====================== */}
        {/* ====================== FLYERS (coleção) ====================== */}
        <TabsContent value="flyers" className="space-y-4">
          {flyerGigs.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              Nenhum flyer ainda. Anexe artes nas GIGs em <strong>/gigs</strong>{" "}
              pra elas aparecerem aqui.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {flyerGigs.map((g) => (
                <FlyerCard key={g.id} gig={g} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-end justify-end gap-2">
            <Button onClick={() => setTplFormOpen(true)}>
              <Plus className="h-4 w-4" /> Novo template
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              Sem templates ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  artistName={identity.artist_name}
                  onDeleted={() => void refresh()}
                />
              ))}
            </div>
          )}

          <TemplateForm
            open={tplFormOpen}
            onOpenChange={setTplFormOpen}
            onSaved={() => void refresh()}
            artistName={identity.artist_name}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function substituteVars(text: string, artistName: string | null): string {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  return text
    .replaceAll("{artista}", artistName ?? "{artista}")
    .replaceAll("{data}", `${dd}/${mm}/${yyyy}`)
    .replaceAll("{venue}", "[venue]")
    .replaceAll("{evento}", "[evento]");
}

const VARS_HINT = "{artista}, {data}, {venue}, {evento}";

function TemplateForm({
  open,
  onOpenChange,
  onSaved,
  artistName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  artistName: string | null;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory | "">("");
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("");
      setContent("");
      setFilePath(null);
      setThumbnailPath(null);
      setNotes("");
    }
  }, [open]);

  const preview = content.trim() ? substituteVars(content, artistName) : null;

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Dê um nome ao template");
      return;
    }
    setSaving(true);
    try {
      await createTemplate({
        name: name.trim(),
        category: (category || null) as TemplateCategory | null,
        content: content.trim() || null,
        file_path: filePath,
        thumbnail_path: thumbnailPath,
        notes: notes.trim() || null,
      });
      toast.success("Template salvo");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              placeholder='Ex: "Fundo Story — agenda"'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TemplateCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Texto do template</Label>
            <Textarea
              rows={4}
              placeholder={`Ex: Oi! Sou {artista} e vou tocar em {venue} no dia {data}…`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Variáveis disponíveis: <code className="font-mono">{VARS_HINT}</code>
            </p>
          </div>
          {preview && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Preview com variáveis</Label>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(preview); toast.success("Copiado!"); }}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Clipboard className="h-3 w-3" />
                  Copiar com variáveis
                </button>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}
          <AttachmentField
            label="Arquivo (PSD, Figma, PNG, MP4…)"
            value={filePath}
            onChange={setFilePath}
            subdir="identity/templates"
            variant="document"
          />
          <AttachmentField
            label="Thumbnail / prévia (opcional)"
            value={thumbnailPath}
            onChange={setThumbnailPath}
            subdir="identity/templates"
            variant="image"
          />
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template: t,
  artistName,
  onDeleted,
}: {
  template: ArtistTemplate;
  artistName: string | null;
  onDeleted: () => void;
}) {
  const thumb = useImageUrl(t.thumbnail_path ?? t.file_path);
  return (
    <div className="group overflow-hidden rounded-lg border bg-card">
      <div
        className={cn(
          "h-36 w-full bg-muted",
          !thumb && "flex items-center justify-center"
        )}
      >
        {thumb ? (
          <img src={thumb} alt={t.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">sem prévia</span>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium leading-tight">{t.name}</div>
            {t.category && (
              <Badge variant="outline" className="mt-1 text-xs">
                {t.category}
              </Badge>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              if (await confirmDialog({ title: "Excluir", description: `Excluir "${t.name}"?`, confirmLabel: "Excluir", destructive: true })) {
                await deleteTemplate(t.id);
                onDeleted();
              }
            }}
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        {t.notes && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{t.notes}</p>
        )}
        {t.content && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const substituted = substituteVars(t.content!, artistName);
              void navigator.clipboard.writeText(substituted);
              toast.success("Copiado com variáveis!");
            }}
          >
            <Clipboard className="h-3.5 w-3.5" />
            Copiar com variáveis
          </Button>
        )}
        {t.file_path && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => openShell(t.file_path!).catch(() => {})}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir arquivo
          </Button>
        )}
      </div>
    </div>
  );
}

function PhotosTab({
  photos,
  folderLinks,
  artistName,
  onPhotosChange,
  onFolderLinksChange,
}: {
  photos: IdentityPhoto[];
  folderLinks: FolderLink[];
  artistName: string | null;
  onPhotosChange: (photos: IdentityPhoto[]) => void;
  onFolderLinksChange: (links: FolderLink[]) => void;
}) {
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const onlyPhotos = photos.filter((p) => !p.type || p.type === "photo");
  const onlyVideos = photos.filter((p) => p.type === "video");
  const allSelected = onlyPhotos.length > 0 && selected.size === onlyPhotos.length;

  // indices map: onlyPhotos[i] → original index in photos[]
  const photoIndices = photos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.type || p.type === "photo")
    .map(({ i }) => i);

  function togglePhoto(localIdx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(localIdx)) next.delete(localIdx);
      else next.add(localIdx);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(onlyPhotos.map((_, i) => i))
    );
  }

  async function handleAddPhoto() {
    setAddingPhoto(true);
    try {
      const src = await pickFile({
        title: "Selecionar foto",
        extensions: IMAGE_EXTS,
        filterName: "Imagens",
      });
      if (!src) return;
      const dest = await saveAttachment(src, "identity/photos");
      onPhotosChange([...photos, { path: dest, caption: "", type: "photo" }]);
      toast.success("Foto adicionada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAddingPhoto(false);
    }
  }

  async function handleAddVideo() {
    setAddingVideo(true);
    try {
      const src = await pickFile({
        title: "Selecionar vídeo",
        extensions: VIDEO_EXTS,
        filterName: "Vídeos",
      });
      if (!src) return;
      const dest = await saveAttachment(src, "identity/videos");
      onPhotosChange([...photos, { path: dest, caption: "", type: "video" }]);
      toast.success("Vídeo adicionado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAddingVideo(false);
    }
  }

  async function handleRemove(originalIdx: number, label: string) {
    if (
      !(await confirmDialog({
        title: "Remover",
        description: `Remover este(a) ${label}?`,
        confirmLabel: "Remover",
        destructive: true,
      }))
    )
      return;
    const item = photos[originalIdx];
    await deleteAttachment(item.path);
    onPhotosChange(photos.filter((_, i) => i !== originalIdx));
    setSelected(new Set());
  }

  async function handleDownloadSelected() {
    const targets =
      selected.size > 0
        ? onlyPhotos.filter((_, i) => selected.has(i))
        : onlyPhotos;
    if (targets.length === 0) return;
    setDownloading(true);
    try {
      const destDir = await openDialog({
        directory: true,
        title: "Escolher pasta de destino",
      });
      if (!destDir || typeof destDir !== "string") return;
      const sep = destDir.includes("\\") && !destDir.includes("/") ? "\\" : "/";
      const base =
        (artistName ?? "fotos").replace(/[\\/:*?"<>|]/g, "_") || "fotos";
      const folder = `${destDir.replace(/[\\/]+$/, "")}${sep}${base}`;
      if (!(await exists(folder))) await mkdir(folder, { recursive: true });
      let ok = 0;
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        const ext = p.path.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "jpg";
        const name = `${base}_${String(i + 1).padStart(2, "0")}.${ext}`;
        try {
          await copyFile(p.path, `${folder}${sep}${name}`);
          ok++;
        } catch {
          /* arquivo ausente — ignora */
        }
      }
      toast.success(`${ok} foto(s) baixada(s)`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Fotos ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Fotos ({onlyPhotos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleAddPhoto} disabled={addingPhoto}>
              {addingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Adicionar foto
            </Button>
            {onlyPhotos.length > 0 && (
              <>
                <Button variant="outline" onClick={toggleAll}>
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadSelected}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {selected.size > 0
                    ? `Baixar selecionadas (${selected.size})`
                    : "Baixar todas"}
                </Button>
              </>
            )}
          </div>

          {onlyPhotos.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              Nenhuma foto ainda.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {onlyPhotos.map((photo, localIdx) => {
                const origIdx = photoIndices[localIdx];
                return (
                  <PhotoCard
                    key={photo.path}
                    photo={photo}
                    selected={selected.has(localIdx)}
                    onToggle={() => togglePhoto(localIdx)}
                    onCaptionChange={(caption) => {
                      const next = [...photos];
                      next[origIdx] = { ...next[origIdx], caption };
                      onPhotosChange(next);
                    }}
                    onRemove={() => void handleRemove(origIdx, "foto")}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Vídeos ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            Vídeos ({onlyVideos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleAddVideo} disabled={addingVideo}>
            {addingVideo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar vídeo
          </Button>

          {onlyVideos.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              Nenhum vídeo ainda. Suporte a MP4, MOV, WebM, AVI, MKV.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {onlyVideos.map((video) => {
                const origIdx = photos.indexOf(video);
                return (
                  <VideoCard
                    key={video.path}
                    video={video}
                    onCaptionChange={(caption) => {
                      const next = [...photos];
                      next[origIdx] = { ...next[origIdx], caption };
                      onPhotosChange(next);
                    }}
                    onRemove={() => void handleRemove(origIdx, "vídeo")}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pastas externas ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" />
            Pastas externas
          </CardTitle>
          <CardDescription>
            Links para pastas no Google Drive, Dropbox, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {folderLinks.map((link, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1.5fr_auto_auto]"
            >
              <Input
                placeholder="Nome (ex: Fotos 2025)"
                value={link.name}
                onChange={(e) => {
                  const next = [...folderLinks];
                  next[idx] = { ...next[idx], name: e.target.value };
                  onFolderLinksChange(next);
                }}
              />
              <Input
                type="url"
                placeholder="https://..."
                value={link.url}
                onChange={(e) => {
                  const next = [...folderLinks];
                  next[idx] = { ...next[idx], url: e.target.value };
                  onFolderLinksChange(next);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={!link.url}
                onClick={() => openShell(link.url).catch(() => {})}
                aria-label="Abrir"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onFolderLinksChange(folderLinks.filter((_, i) => i !== idx))
                }
                aria-label="Remover"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onFolderLinksChange([...folderLinks, { name: "", url: "" }])
            }
            className="flex items-center gap-1.5 rounded-md border-2 border-dashed px-3 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Novo link de pasta
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function PhotoCard({
  photo,
  selected,
  onToggle,
  onCaptionChange,
  onRemove,
}: {
  photo: IdentityPhoto;
  selected: boolean;
  onToggle: () => void;
  onCaptionChange: (caption: string) => void;
  onRemove: () => void;
}) {
  const url = useImageUrl(photo.path);
  return (
    <div
      className={cn(
        "group overflow-hidden rounded-lg border bg-card",
        selected && "ring-2 ring-primary"
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {url ? (
          <img
            src={url}
            alt={photo.caption || "Foto"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Carregando…
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="absolute left-2 top-2 rounded bg-background/80 p-1"
          aria-label={selected ? "Desmarcar" : "Selecionar"}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100"
          onClick={onRemove}
          aria-label="Remover"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-2">
        <Input
          placeholder="Legenda (opcional)"
          value={photo.caption ?? ""}
          onChange={(e) => onCaptionChange(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}

function VideoCard({
  video,
  onCaptionChange,
  onRemove,
}: {
  video: IdentityPhoto;
  onCaptionChange: (caption: string) => void;
  onRemove: () => void;
}) {
  const url = useImageUrl(video.path);
  return (
    <div className="group overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-video w-full bg-muted">
        {url ? (
          <video
            src={url}
            controls
            className="h-full w-full object-contain"
            preload="metadata"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Carregando…
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100"
          onClick={onRemove}
          aria-label="Remover"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-2">
        <Input
          placeholder="Legenda (opcional)"
          value={video.caption ?? ""}
          onChange={(e) => onCaptionChange(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}

function FlyerCard({ gig }: { gig: Gig }) {
  const url = useImageUrl(gig.banner_file_path);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="aspect-square w-full bg-muted">
        {url ? (
          <img
            src={url}
            alt={gigDisplayName(gig)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Carregando…
          </div>
        )}
      </div>
      <div className="p-2 text-xs">
        <div className="truncate font-medium">{gigDisplayName(gig)}</div>
        <div className="truncate text-muted-foreground">
          {gig.venue_name} · {formatDate(gig.date)}
        </div>
      </div>
    </div>
  );
}
