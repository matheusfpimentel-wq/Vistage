import { useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Unplug } from "lucide-react";
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
import { open as openShell } from "@tauri-apps/plugin-shell";
import {
  clearNotionConfig,
  createIdeasDatabase,
  getNotionConfig,
  listNotionPages,
  saveNotionToken,
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
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    const c = await getNotionConfig();
    setSavedToken(c.token);
    setDatabaseId(c.databaseId);
    setLastSync(c.lastSync);
    if (c.token && !c.databaseId) {
      try {
        setPages(await listNotionPages(c.token));
      } catch {
        /* falha ao listar — usuário pode recarregar */
      }
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

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncNotion();
      toast.success(
        `Notion: ${r.created} criada(s), ${r.updated} atualizada(s)` +
          (r.failed ? `, ${r.failed} falha(s)` : "")
      );
      await refresh();
    } catch (e) {
      toast.error(`Erro ao sincronizar: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateDb() {
    if (!savedToken || !parentPage) return;
    setCreating(true);
    try {
      await createIdeasDatabase(savedToken, parentPage);
      toast.success("Database de ideias criado no Notion");
      await refresh();
      void handleSync();
    } catch (e) {
      toast.error(`Erro ao criar database: ${String(e)}`);
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

  const connected = !!savedToken;
  const ready = connected && !!databaseId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Notion
          <InfoHint>
            Envia suas ideias (1 via) para um database criado no Notion. Elas
            continuam vivendo no Vistage; o Notion vira um depósito/vitrine.
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
              <Button onClick={() => void handleCreateDb()} disabled={creating || !parentPage}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Criar database e sincronizar
              </Button>
              <Button variant="outline" onClick={() => void handleDisconnect()}>
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <Check className="h-4 w-4" /> Conectado
            </div>
            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Último envio: {new Date(lastSync).toLocaleString("pt-BR")}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void handleSync()} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar
              </Button>
              <Button variant="outline" onClick={() => void handleDisconnect()}>
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
