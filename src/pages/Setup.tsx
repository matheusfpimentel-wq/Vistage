import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, HardDrive, Loader2, Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useConfigStore } from "@/lib/config";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

type Mode = "idle" | "creating" | "loading";

export function Setup() {
  const { setupNew, loadExisting, errorMessage } = useConfigStore();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(errorMessage);

  async function handleCreate() {
    setError(null);
    try {
      const folder = await openDialog({
        directory: true,
        multiple: false,
        title: "Escolha a pasta no HD externo onde o Vistage vai criar o banco de dados",
      });
      if (!folder || typeof folder !== "string") return;
      setMode("creating");
      await setupNew(folder);
    } catch (e) {
      setError(`Falha ao criar o banco: ${String(e)}`);
    } finally {
      setMode("idle");
    }
  }

  async function handleLoad() {
    setError(null);
    try {
      const file = await openDialog({
        multiple: false,
        title: "Selecione o arquivo vistage.config.json no seu HD",
        filters: [{ name: "Config Vistage", extensions: ["json"] }],
      });
      if (!file || typeof file !== "string") return;
      setMode("loading");
      await loadExisting(file);
    } catch (e) {
      const msg = String(e);
      const isCloudFile =
        msg.includes("unable to open") ||
        msg.includes("no such file") ||
        msg.includes("not found") ||
        msg.includes("os error 2");
      setError(
        isCloudFile
          ? "O banco de dados não foi encontrado. Se ele está no Google Drive ou OneDrive, aguarde a sincronização terminar (ícone na barra de menus) e tente de novo. Se necessário, clique com botão direito na pasta → \"Disponível off-line\"."
          : `Falha ao carregar: ${msg}`
      );
    } finally {
      setMode("idle");
    }
  }

  const busy = mode !== "idle";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <HardDrive className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wider">
              Setup inicial
            </span>
          </div>
          <CardTitle>Onde vamos guardar seus anexos?</CardTitle>
          <CardDescription>
            O Vistage é local-first. Escolha uma pasta (no HD externo, de
            preferência) para os anexos e a configuração. O banco de dados fica
            no computador; para levar TODOS os dados entre máquinas, use o
            documento <code>.vistage</code> (Salvar como…).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="group flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent/40 disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                {mode === "creating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="font-medium">Criar novo banco</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Escolha uma pasta vazia (ex:{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  /Volumes/HD/vistage
                </code>
                ). Criamos a pasta <code>uploads/</code> e o arquivo de
                configuração.
              </span>
            </button>

            <button
              type="button"
              onClick={handleLoad}
              disabled={busy}
              className="group flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent/40 disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                {mode === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                <span className="font-medium">Abrir banco existente</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Localize o arquivo{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  vistage.config.json
                </code>{" "}
                que já existe no HD ou na sua pasta sincronizada (Google Drive,
                OneDrive, Dropbox).
              </span>
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Dica</div>
            Em Mac, o caminho típico é{" "}
            <code>/Volumes/&lt;NomeDoHD&gt;/vistage</code>. Em Windows, algo
            como <code>E:\vistage</code>. Para continuar noutra máquina com
            todos os dados, salve um <code>.vistage</code> e abra-o lá.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
