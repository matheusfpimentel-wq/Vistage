import { Music2, FileText, NotebookPen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModuleView } from "@/lib/moduleView";
import { Conhecimento } from "./views/Conhecimento";
import { Musicas } from "./views/Musicas";

export function BibliotecaPage() {
  const [tab, setTab] = useModuleView<"musicas" | "documentos" | "conhecimento">(
    "biblioteca",
    "conhecimento"
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Biblioteca</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="musicas">
            <Music2 className="mr-1.5 h-4 w-4" /> Músicas
          </TabsTrigger>
          <TabsTrigger value="documentos">
            <FileText className="mr-1.5 h-4 w-4" /> Documentos
          </TabsTrigger>
          <TabsTrigger value="conhecimento">
            <NotebookPen className="mr-1.5 h-4 w-4" /> Conhecimento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="musicas">
          <Musicas />
        </TabsContent>

        <TabsContent value="documentos">
          <ComingSoon
            icon={FileText}
            title="Biblioteca de Documentos"
            lines={[
              "Acesso a uma pasta do Google Drive com contratos, modelos e rider técnico.",
              "Listar, abrir e associar um documento a um GIG/festa/contato — sem embutir no .vistage.",
            ]}
          />
        </TabsContent>

        <TabsContent value="conhecimento">
          <Conhecimento />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComingSoon({
  icon: Icon,
  title,
  lines,
}: {
  icon: typeof Music2;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
      <div className="text-sm font-medium">{title}</div>
      <div className="mx-auto mt-2 max-w-md space-y-1 text-xs text-muted-foreground">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-primary/70">
        Próxima leva
      </p>
    </div>
  );
}
