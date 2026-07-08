import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModuleView } from "@/lib/moduleView";
import { ObjetivosPage } from "./ObjetivosPage";
import { EisenhowerSection } from "./methods/EisenhowerSection";
import { SwotSection } from "./methods/SwotSection";
import { NpsSection } from "./methods/NpsSection";

// ============================================================
// Gestão Estratégica — hub dos métodos de gestão
//
// Substitui o antigo módulo de OKRs: reúne a edição de OKR + os frameworks que
// antes viviam na aba "Metodologias" do Dashboard (Eisenhower, SWOT, NPS).
// Cada aba reaproveita o componente original, sem reescrever a lógica:
//  • OKR        → ObjetivosPage (módulo de objetivos completo)
//  • Eisenhower → TaskEisenhowerView (mesma base de Tarefas)
//  • SWOT       → SwotSection (methodologies.ts)
//  • NPS        → NpsSection (avaliações de contratante das GIGs)
// ============================================================

export function GestaoEstrategicaPage() {
  const [tab, setTab] = useModuleView<string>("estrategia", "okr");
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="flex-wrap h-auto gap-0.5">
        <TabsTrigger value="okr">OKR</TabsTrigger>
        <TabsTrigger value="eisenhower">Eisenhower</TabsTrigger>
        <TabsTrigger value="swot">SWOT</TabsTrigger>
        <TabsTrigger value="nps">NPS</TabsTrigger>
      </TabsList>

      <TabsContent value="okr">
        <ObjetivosPage />
      </TabsContent>

      <TabsContent value="eisenhower">
        <EisenhowerSection />
      </TabsContent>

      <TabsContent value="swot">
        <SwotSection />
      </TabsContent>

      <TabsContent value="nps">
        <NpsSection />
      </TabsContent>
    </Tabs>
  );
}
