import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Pencil, RefreshCw, Unplug } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { ConnectedBadge, IntegrationActions } from "@/components/shared/IntegrationCard";
import { open as openShell } from "@tauri-apps/plugin-shell";
import {
  clearNotionConfig,
  createIdeasDatabase,
  createNotesDatabase,
  getNotesNotionConfig,
  getNotionConfig,
  getNotionPageTitle,
  listNotionPages,
  notionErrorMessage,
  repointNotionParent,
  saveNotionToken,
  syncNotesNotion,
  syncNotion,
  validateNotionToken,
} from "@/lib/notion";

/** Integração Notion (1 via): empurra as ideias pra um database criado lá. */
export function NotionSettings() {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [databaseId, setDatabaseId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pages, setPages] = useState<{ id: string; title: string }[]>([]);
  const [parentPage, setParentPage] = useState("");
  const [parentPageId, setParentPageId] = useState<string | null>(null);
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [changingPage, setChangingPage] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Notas (database própria, separada das ideias)
  const [notesDbId, setNotesDbId] = useState<string | null>(null);
  const [notesLastSync, setNotesLastSync] = useState<string | null>(null);

  async function refresh() {
    const c = await getNotionConfig();
    setSavedToken(c.token);
    setDatabaseId(c.databaseId);
    setLastSync(c.lastSync);
    setParentPageId(c.parentPageId);
    const nc = await getNotesNotionConfig();
    setNotesDbId(nc.databaseId);
    setNotesLastSync(nc.lastSync);
    if (c.token && c.parentPageId && c.databaseId) {
      void getNotionPageTitle(c.token, c.parentPageId).then(setParentTitle).catch(() => {});
    }
    if (c.token && !c.databaseId) {
      try {
        setPages(await listNotionPages(c.token));
      } catch {
        /* falha ao listar — usuário pode recarregar */
      }
    }
  }

  /** Carrega/recarrega a lista de páginas (pra escolher onde sincronizar). */
  async function loadPages() {
    if (!savedToken) return;
    try {
      setPages(await listNotionPages(savedToken));
    } catch {
      /* falha ao listar */
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function handleConnect() {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      await validateNotionToken(token.trim());
      await saveNotionToken(token.trim());
      setToken("");
      toast.success("Notion conectado");
      await refresh();
    } catch (e) {
      toast.error(`Token inválido: ${String(e)}`);
    } finally {
      setConnecting(false);
    }
  }

  /** Um único botão sincroniza TUDO: ideias + notas (cria a base de notas se faltar). */
  async function handleSyncAll() {
    setSyncing(true);
    try {
      if (savedToken && !notesDbId) {
        try {
          await createNotesDatabase(savedToken);
          await refresh();
        } catch {
          /* segue só com ideias se a base de notas falhar */
        }
      }
      const ideas = await syncNotion();
      let notes = { created: 0, updated: 0, failed: 0 };
      try {
        notes = await syncNotesNotion();
      } catch {
        /* sem notas configuradas — ok */
      }
      const created = ideas.created + notes.created;
      const updated = ideas.updated + notes.updated;
      const failed = ideas.failed + notes.failed;
      toast.success(
        `Notion sincronizado: ${created} criada(s), ${updated} atualizada(s)` +
          (failed ? `, ${failed} falha(s)` : "")
      );
      await refresh();
    } catch (e) {
      toast.error(`Erro ao sincronizar: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateDb() {
    if (!savedToken) return;
    setCreating(true);
    try {
      // parentPage é só uma dica; o Vistage resolve/conserta a página-pai sozinho.
      await createIdeasDatabase(savedToken, parentPage || undefined);
      toast.success("Database criado no Notion");
      await refresh();
      void handleSyncAll();
    } catch (e) {
      toast.error(notionErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDisconnect() {
    await clearNotionConfig();
    setPages([]);
    setParentPage("");
    toast.success("Notion desconectado");
    await refresh();
  }

  /** Troca a página do Noton: recria os databases na página escolhida e re-sincroniza. */
  async function handleMovePage() {
    if (!savedToken || !parentPage) return;
    setCreating(true);
    try {
      await repointNotionParent(savedToken, parentPage);
      toast.success("Página trocada — recriando e sincronizando no Notion");
      setChangingPage(false);
      setParentPage("");
      await refresh();
      void handleSyncAll();
    } catch (e) {
      toast.error(notionErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  const connected = !!savedToken;
  const ready = connected && !!databaseId;
  // Carimbo "Última sincronização": o envio mais recente entre ideias e notas.
  const lastSyncAt = [lastSync, notesLastSync]
    .filter((s): s is string => !!s)
    .sort()
    .at(-1);
  const notionPageUrl = parentPageId
    ? `https://www.notion.so/${parentPageId.replace(/-/g, "")}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Notion
          {ready && <ConnectedBadge />}
          <InfoHint>
            Envia suas ideias e notas (1 via) para databases criados no Notion.
            Elas continuam vivendo no Vistage; o Notion vira um depósito/vitrine.
          </InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!connected ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="notion-token" className="text-xs">
                Token de integração interna
              </Label>
              <Input
                id="notion-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole o token (secret_… ou ntn_…)"
              />
              <p className="text-[11px] text-muted-foreground">
                Crie uma integração interna em{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() =>
                    openShell("https://www.notion.so/my-integrations").catch(() => {})
                  }
                >
                  notion.so/my-integrations
                </button>{" "}
                e, no Notion, compartilhe (Connections) com ela a página onde quer
                guardar as ideias.
              </p>
            </div>
            <Button onClick={() => void handleConnect()} disabled={connecting || !token.trim()}>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Conectar
            </Button>
          </>
        ) : !ready ? (
          <>
            <p className="text-sm text-muted-foreground">
              Escolha a página (compartilhada com a integração) onde o Vistage vai
              criar o database de ideias.
            </p>
            <div className="flex gap-2">
              <Select value={parentPage} onValueChange={setParentPage}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Escolha uma página…" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void refresh()}
                aria-label="Recarregar páginas"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {pages.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma página encontrada. No Notion, abra a página → menu “•••” →
                “Connections” → adicione sua integração; depois recarregue.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void handleCreateDb()} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Criar database e sincronizar
              </Button>
              <Button variant="outline" onClick={() => void handleDisconnect()}>
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <IntegrationActions
            timestampLabel={
              lastSyncAt
                ? `Última sincronização: ${new Date(lastSyncAt).toLocaleString("pt-BR")}`
                : null
            }
            onSync={() => void handleSyncAll()}
            syncing={syncing}
            syncLabel="Sincronizar"
            onDisconnect={() => void handleDisconnect()}
          >
            {/* Página declarada — pra onde ideias e notas vão; pode trocar. */}
            <div className="space-y-2 rounded-md border p-3 text-xs">
              <p className="font-medium">Página no Notion</p>
              <p className="text-muted-foreground">
                Ideias e notas vão para
                {parentTitle ? (
                  <> a página <span className="font-medium text-foreground">“{parentTitle}”</span>.</>
                ) : (
                  <> uma página no seu Notion.</>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {notionPageUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openShell(notionPageUrl).catch(() => {})}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir no Notion
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setChangingPage((v) => !v);
                    if (!changingPage) void loadPages();
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Trocar página
                </Button>
              </div>
              {changingPage && (
                <div className="space-y-2 border-t pt-2">
                  <div className="flex gap-2">
                    <Select value={parentPage} onValueChange={setParentPage}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Escolha uma página…" />
                      </SelectTrigger>
                      <SelectContent>
                        {pages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => void loadPages()} aria-label="Recarregar páginas">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button size="sm" onClick={() => void handleMovePage()} disabled={creating || !parentPage}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Mover para esta página
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Cria novos databases na página escolhida e re-sincroniza tudo lá. As páginas
                    antigas continuam onde estavam.
                  </p>
                </div>
              )}
            </div>
          </IntegrationActions>
        )}
      </CardContent>
    </Card>
  );
}
