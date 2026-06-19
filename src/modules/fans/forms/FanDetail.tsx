import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { LevelBadge } from "../components/LevelBadge";
import { FanInteractionList } from "../components/FanInteractionList";
import { FanPerksList } from "../components/FanPerksList";
import { FanQuickActions } from "../components/FanQuickActions";
import { FanFields } from "./FanFields";
import { getFan, listGigsForFan, updateFan } from "../api";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import type { Fan, FanCreateInput } from "../types";
import { formatDate } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fanId: number | null;
};

function fanToState(f: Fan): FanCreateInput {
  return {
    name: f.name,
    level: f.level,
    is_ambassador: f.is_ambassador,
    instagram: f.instagram,
    email: f.email,
    phone: f.phone,
    city: f.city,
    tags: f.tags,
    notes: f.notes,
    photo_path: f.photo_path,
    contact_id: f.contact_id,
  };
}

export function FanDetail({ open, onOpenChange, fanId }: Props) {
  const [fan, setFan] = useState<Fan | null>(null);
  const [state, setStateRaw] = useState<FanCreateInput | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [gigs, setGigs] = useState<
    { id: number; name: string | null; date: string | null; city: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const setState = (updater: (prev: FanCreateInput) => FanCreateInput) =>
    setStateRaw((s) => (s ? updater(s) : s));

  async function refresh() {
    if (!fanId) return;
    setLoading(true);
    try {
      const [f, gs] = await Promise.all([
        getFan(fanId),
        listGigsForFan(fanId).catch(() => []),
      ]);
      setFan(f);
      setStateRaw(f ? fanToState(f) : null);
      setGigs(gs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && fanId) void refresh();
  }, [open, fanId]);

  useEffect(() => {
    if (open) void listContacts().then(setContacts).catch(() => {});
  }, [open]);

  async function handleSave() {
    if (!fan || !state) return;
    if (!state.name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await updateFan({ id: fan.id, ...state });
      toast.success("Fã atualizado");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!fanId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {loading || !fan || !state ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <FanPhotoCircle fan={fan} />
                <div className="space-y-1">
                  <DialogTitle>{fan.name}</DialogTitle>
                  <LevelBadge level={fan.level} />
                </div>
              </div>
            </DialogHeader>

            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="interactions">Interações</TabsTrigger>
                <TabsTrigger value="actions">Ações</TabsTrigger>
                <TabsTrigger value="perks">Perks &amp; brindes</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-3 pt-2">
                <FanFields state={state} setState={setState} contacts={contacts} />

                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </div>

                {gigs.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Mic2 className="h-3.5 w-3.5" /> Presença em shows ({gigs.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {gigs.map((g) => (
                        <Link
                          key={g.id}
                          to={`/gigs?open=${g.id}`}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:border-primary"
                        >
                          <span className="font-medium">{g.name ?? "Show"}</span>
                          {g.date && (
                            <span className="text-muted-foreground">{formatDate(g.date)}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="interactions">
                <FanInteractionList fanId={fan.id} onChange={refresh} />
              </TabsContent>

              <TabsContent value="actions" className="pt-2">
                <FanQuickActions fanId={fan.id} fanName={fan.name} />
              </TabsContent>

              <TabsContent value="perks" className="pt-2">
                <FanPerksList fanId={fan.id} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FanPhotoCircle({ fan }: { fan: Fan }) {
  const url = useImageUrl(fan.photo_path);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={fan.name}
      className="h-16 w-16 rounded-full object-cover"
    />
  );
}
