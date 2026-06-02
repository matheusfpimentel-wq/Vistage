import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
  type SocialLink,
  type SocialNetwork,
  type TemplateCategory,
} from "./types";
import { useImageUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

export function IdentityPage() {
  const [identity, setIdentity] = useState<ArtistIdentity | null>(null);
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
        palette: identity.palette,
        notes: identity.notes,
      });
      toast.success("Identidade salva");
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
              <CardDescription>Seu kit de marca.</CardDescription>
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
                  placeholder="Em 1-2 frases, quem você é como DJ/produtor."
                  value={identity.bio_short ?? ""}
                  onChange={(e) => set("bio_short", e.target.value || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Briefing completo / bio longa</Label>
                <Textarea
                  rows={6}
                  placeholder="Trajetória, sonoridade, residências, parcerias…"
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
                      <Badge
                        variant="secondary"
                        className="justify-start truncate"
                      >
                        {s.network}
                      </Badge>
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
                  onDeleted={() => void refresh()}
                />
              ))}
            </div>
          )}

          <TemplateForm
            open={tplFormOpen}
            onOpenChange={setTplFormOpen}
            onSaved={() => void refresh()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateForm({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory | "">("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCategory("");
      setFilePath(null);
      setThumbnailPath(null);
      setNotes("");
    }
  }, [open]);

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
  onDeleted,
}: {
  template: ArtistTemplate;
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
