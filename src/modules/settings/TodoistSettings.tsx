import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { ConnectedBadge, IntegrationActions } from "@/components/shared/IntegrationCard";
import {
  clearTodoistConfig,
  getTodoistConfig,
  listTodoistProjects,
  saveTodoistConfig,
  syncTodoist,
} from "@/lib/todoist";

type Project = { id: string; name: string };

export function TodoistSettings() {
  const [token, setToken] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void getTodoistConfig().then(({ token: t, projectId: p, lastSync: ls }) => {
      if (t) setToken(t);
      if (p) setProjectId(p);
      if (ls) setLastSync(ls);
      setConnected(!!t && !!p);
    });
  }, []);

  async function handleLoadProjects() {
    if (!token.trim()) {
      toast.error("Cole o token de API do Todoist primeiro");
      return;
    }
    setLoadingProjects(true);
    try {
      const list = await listTodoistProjects(token.trim());
      setProjects(list);
      if (list.length > 0 && !projectId) setProjectId(list[0].id);
    } catch (e) {
      toast.error(`Erro ao carregar projetos: ${String(e)}`);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function handleConnect() {
    if (!token.trim() || !projectId) {
      toast.error("Preencha o token e selecione um projeto");
      return;
    }
    await saveTodoistConfig(token.trim(), projectId);
    setConnected(true);
    toast.success("Todoist conectado");
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncTodoist();
      const msg = [
        r.pushed > 0 && `${r.pushed} enviada${r.pushed > 1 ? "s" : ""} ao Todoist`,
        r.pulled > 0 && `${r.pulled} importada${r.pulled > 1 ? "s" : ""}`,
        r.updated > 0 && `${r.updated} atualizada${r.updated > 1 ? "s" : ""}`,
        r.completed > 0 && `${r.completed} concluída${r.completed > 1 ? "s" : ""}`,
      ]
        .filter(Boolean)
        .join(", ");
      const now = new Date().toISOString();
      setLastSync(now);
      toast.success(msg || "Tudo sincronizado — nenhuma alteração detectada");
    } catch (e) {
      toast.error(`Erro na sincronização: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    const ok = await confirmDialog({
      title: "Desconectar Todoist",
      description: "Remove o token e o projeto configurados. As tarefas locais não são apagadas.",
      confirmLabel: "Desconectar",
      destructive: true,
    });
    if (!ok) return;
    await clearTodoistConfig();
    setConnected(false);
    setToken("");
    setProjectId("");
    setLastSync(null);
    setProjects([]);
    toast.success("Todoist desconectado");
  }

  function formatSync(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <img
            src="https://todoist.com/favicon.ico"
            alt=""
            className="h-4 w-4 rounded"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          Todoist
          {connected && <ConnectedBadge />}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {!connected ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="todoist-token">Token de API pessoal</Label>
              <Input
                id="todoist-token"
                type="password"
                placeholder="Cole o token do Todoist aqui…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Acesse Todoist → Configurações → Integrações → Token de API do
                desenvolvedor.
              </p>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Projeto</Label>
                {projects.length > 0 ? (
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Carregue os projetos ao lado →"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadProjects}
                disabled={loadingProjects}
                className="shrink-0"
              >
                {loadingProjects ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Carregar projetos"
                )}
              </Button>
            </div>

            <Button onClick={handleConnect} disabled={!token || !projectId}>
              <Link2 className="h-4 w-4" /> Conectar
            </Button>
          </>
        ) : (
          <IntegrationActions
            timestampLabel={lastSync ? `Última sincronização: ${formatSync(lastSync)}` : null}
            onSync={() => void handleSync()}
            syncing={syncing}
            onDisconnect={() => void handleDisconnect()}
          />
        )}
      </CardContent>
    </Card>
  );
}
