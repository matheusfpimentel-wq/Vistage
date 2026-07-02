import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Mic2, Plus, Star, UserCheck } from "lucide-react";
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
import {
  getFan,
  listFanNames,
  listGigsForFan,
  listVipGigsForFan,
  recomputeIndicators,
  setFanContactId,
  updateFan,
} from "../api";
import { createContact, listContacts } from "@/modules/crm/api";
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
    indicated_by_fan_id: f.indicated_by_fan_id,
    origem: f.origem,
  };
}

export function FanDetail({ open, onOpenChange, fanId }: Props) {
  const [fan, setFan] = useState<Fan | null>(null);
  const [state, setStateRaw] = useState<FanCreateInput | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fanOptions, setFanOptions] = useState<{ id: number; name: string }[]>([]);
  const [gigs, setGigs] = useState<
    { id: number; name: string | null; date: string | null; city: string | null }[]
  >([]);
  const [vipGigs, setVipGigs] = useState<
    { gig_id: number; gig_name: string; list_name: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const navigate = useNavigate();

  const setState = (updater: (prev: FanCreateInput) => FanCreateInput) =>
    setStateRaw((s) => (s ? updater(s) : s));

  async function refresh() {
    if (!fanId) return;
    setLoading(true);
    try {
      const [f, gs, vips] = await Promise.all([
        getFan(fanId),
        listGigsForFan(fanId).catch(() => []),
        listVipGigsForFan(fanId).catch(() => []),
      ]);
      setFan(f);
      setStateRaw(f ? fanToState(f) : null);
      setGigs(gs);
      setVipGigs(vips);
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

  // Opções do seletor "Indicado por:" — todos os fãs menos o próprio.
  useEffect(() => {
    if (open) void listFanNames().then(setFanOptions).catch(() => {});
  }, [open]);

  async function handleSave() {
    if (!fan || !state) return;
    if (!state.name.trim()) {
      toast.error("O nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const prevIndicator = fan.indicated_by_fan_id;
      await updateFan({ id: fan.id, ...state });
      // Crédito de Indicação: recalcula o nível do indicador anterior e do novo.
      await recomputeIndicators([prevIndicator, state.indicated_by_fan_id]);
      toast.success("Fã atualizado");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // Conversão manual Fã → Pessoa: cria um contato semeado a partir do fã e guarda
  // a procedência no fans.contact_id. Sem sync — é um clone pontual.
  async function handleMakeContact() {
    if (!fan) return;
    if (fan.contact_id != null) {
      const linkedId = fan.contact_id;
      toast.info("Este fã já está vinculado a um contato.", {
        action: { label: "Abrir", onClick: () => navigate(`/pessoas?open=${linkedId}`) },
      });
      return;
    }
    setLinking(true);
    try {
      const contactId = await createContact({
        name: fan.name,
        types: [],
        phone: fan.phone,
        email: fan.email,
        instagram: fan.instagram,
        city: fan.city,
        tags: [],
        notes: fan.notes,
        rating: null,
        follower_count: null,
        venue_id: null,
        company: null,
        photo_path: fan.photo_path,
      });
      await setFanContactId(fan.id, contactId);
      toast.success("Contato criado em Pessoas a partir deste fã.", {
        action: { label: "Abrir", onClick: () => navigate(`/pessoas?open=${contactId}`) },
      });
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setLinking(false);
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
                <div className="min-w-0 space-y-1">
                  <DialogTitle>{fan.name}</DialogTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <LevelBadge level={fan.level} />
                    {fan.nivel_changed_at && (
                      <span className="text-xs text-muted-foreground">
                        no nível {fan.level} desde {formatDate(fan.nivel_changed_at)}
                      </span>
                    )}
                  </div>
                  {fan.origem && (
                    <p className="text-xs text-muted-foreground">Origem: {fan.origem}</p>
                  )}
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
                <FanFields
                  state={state}
                  setState={setState}
                  fanOptions={fanOptions.filter((f) => f.id !== fan.id)}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* (+) único de CRM: cria/abre o contato vinculado em Pessoas —
                      substitui os dois controles redundantes de antes (§1.1). */}
                  {fan.contact_id != null ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => navigate(`/pessoas?open=${fan.contact_id}`)}
                      title="Abrir a pessoa vinculada em Pessoas"
                    >
                      <UserCheck className="h-4 w-4" />
                      {contacts.find((c) => c.id === fan.contact_id)?.name ?? "Pessoa vinculada"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void handleMakeContact()}
                      disabled={linking}
                      title="Cria um contato em Pessoas a partir deste fã (sem sincronização)."
                    >
                      {linking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Tornar contato
                    </Button>
                  )}
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

                {vipGigs.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Star className="h-3.5 w-3.5" /> VIP em ({vipGigs.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {vipGigs.map((g) => (
                        <Link
                          key={`${g.gig_id}-${g.list_name}`}
                          to={`/gigs?open=${g.gig_id}`}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:border-primary"
                        >
                          <span className="font-medium">{g.gig_name}</span>
                          <span className="text-muted-foreground">· {g.list_name}</span>
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
