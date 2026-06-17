import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import {
  clearTodoistConfig,
  getTodoistConfig,
  listTodoistProjects,
  saveTodoistConfig,
  syncTodoist,
  unlinkAllTodoist,
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
      description:
        "Remove o token e o projeto configurados. As tarefas locais mantêm o vínculo (todoist_id) — você pode desvincular tudo abaixo se quiser uma limpeza completa.",
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

  async function handleUnlinkAll() {
    const ok = await confirmDialog({
      title: "Desvincular todas as tarefas",
      description:
        "Remove o todoist_id de todas as tarefas locais e desconecta a integração. Na próxima sincronização, tudo será tratado como novo. Esta ação não apaga nada no Todoist.",
      confirmLabel: "Desvincular tudo",
      destructive: true,
    });
    if (!ok) return;
    await unlinkAllTodoist();
    setConnected(false);
    setToken("");
    setProjectId("");
    setLastSync(null);
    setProjects([]);
    toast.success("Vínculos removidos. Todoist desconectado.");
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
          {connected && (
            <span className="flex items-center gap-1 text-xs font-normal text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Sincronização bidirecional com um projeto do Todoist. Tarefas criadas
          aqui são enviadas ao Todoist e vice-versa. Conclusões se espelham nos
          dois sentidos.
        </CardDescription>
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
          <div className="space-y-3">
            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Última sincronização: {formatSync(lastSync)}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSync} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar agora
              </Button>
              <Button variant="outline" onClick={handleDisconnect}>
                Desconectar
              </Button>
            </div>

            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Limpeza completa</p>
              <p>
                Remove os vínculos de todas as tarefas locais com o Todoist.
                Útil se quiser trocar de projeto ou começar do zero.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-destructive hover:text-destructive"
                onClick={handleUnlinkAll}
              >
                <Unlink className="h-3.5 w-3.5" />
                Desvincular tudo e desconectar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
