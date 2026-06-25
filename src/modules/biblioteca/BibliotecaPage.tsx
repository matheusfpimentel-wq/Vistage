import { Music2, FileText, NotebookPen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModuleView } from "@/lib/moduleView";
import { Conhecimento } from "./views/Conhecimento";
import { Musicas } from "./views/Musicas";
import { Documentos } from "./views/Documentos";

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
          <Documentos />
        </TabsContent>

        <TabsContent value="conhecimento">
          <Conhecimento />
        </TabsContent>
      </Tabs>
    </div>
  );
}
