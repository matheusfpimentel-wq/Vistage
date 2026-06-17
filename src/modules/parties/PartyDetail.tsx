import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  partyStatusColor,
  type PartyBudgetItem,
  type PartyDeserialized,
  type PartyStage,
  type PartyTask,
  type PartyTicket,
} from "./types";
import {
  initDefaultStages,
  listPartyBudgetItems,
  listPartyStages,
  listPartyTasks,
  listPartyTickets,
} from "./api";
import { WorkflowTab } from "./tabs/WorkflowTab";
import { OrcamentoTab } from "./tabs/OrcamentoTab";
import { IngressosTab } from "./tabs/IngressosTab";
import { TarefasTab } from "./tabs/TarefasTab";
import { GeralTab } from "./tabs/GeralTab";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: PartyDeserialized;
  onEdit: () => void;
  onRefresh: () => void;
  onDelete: () => void;
};

export function PartyDetail({ open, onOpenChange, party, onEdit, onRefresh, onDelete }: Props) {
  const navigate = useNavigate();

  const [stages, setStages] = useState<PartyStage[]>([]);
  const [budgetItems, setBudgetItems] = useState<PartyBudgetItem[]>([]);
  const [tickets, setTickets] = useState<PartyTicket[]>([]);
  const [tasks, setTasks] = useState<PartyTask[]>([]);

  const loadAll = useCallback(async () => {
    if (!open) return;
    await initDefaultStages(party.id);
    const [s, b, t, tk] = await Promise.all([
      listPartyStages(party.id),
      listPartyBudgetItems(party.id),
      listPartyTickets(party.id),
      listPartyTasks(party.id),
    ]);
    setStages(s);
    setBudgetItems(b);
    setTickets(t);
    setTasks(tk);
  }, [open, party.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>{party.title}</DialogTitle>
            <Badge className={partyStatusColor(party.status)}>{party.status}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => { onDelete(); onOpenChange(false); }}
              aria-label="Excluir festa"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="workflow">
          <TabsList>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
            <TabsTrigger value="ingressos">Ingressos</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
            <TabsTrigger value="geral">Geral</TabsTrigger>
          </TabsList>

          <TabsContent value="workflow" className="pt-2">
            <WorkflowTab
              partyId={party.id}
              stages={stages}
              onReload={loadAll}
            />
          </TabsContent>

          <TabsContent value="orcamento" className="pt-2">
            <OrcamentoTab
              party={party}
              items={budgetItems}
              tickets={tickets}
              onReload={async () => { await loadAll(); onRefresh(); }}
              navigate={navigate}
            />
          </TabsContent>

          <TabsContent value="ingressos" className="pt-2">
            <IngressosTab
              partyId={party.id}
              tickets={tickets}
              onReload={loadAll}
            />
          </TabsContent>

          <TabsContent value="tarefas" className="pt-2">
            <TarefasTab
              partyId={party.id}
              stages={stages}
              tasks={tasks}
              onReload={loadAll}
            />
          </TabsContent>

          <TabsContent value="geral" className="pt-2">
            <GeralTab party={party} onEdit={onEdit} navigate={navigate} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
