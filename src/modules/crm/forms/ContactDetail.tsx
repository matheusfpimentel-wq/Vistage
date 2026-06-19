import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarRange,
  DollarSign,
  Instagram,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ratingToPriority } from "../types";
import { TypeBadges } from "../components/TypeBadges";
import { InteractionList } from "../components/InteractionList";
import {
  getContact,
  getContactStats,
  listGigsByContact,
} from "../api";
import type { Contact, ContactStats } from "../types";
import type { Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { formatCurrency, formatDate } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";
import { getSupplierIdForContact } from "@/modules/suppliers/api";
import {
  RELATION_TAB_LABEL,
  RelationshipTabContent,
  ServicesTabContent,
} from "@/modules/pessoas/RelationshipTabs";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number | null;
  onEdit: (contact: Contact) => void;
  onCreateGig: (contact: Contact) => void;
};

export function ContactDetail({
  open,
  onOpenChange,
  contactId,
  onEdit,
  onCreateGig,
}: Props) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!contactId) return;
    setLoading(true);
    try {
      const [c, s, g, sup] = await Promise.all([
        getContact(contactId),
        getContactStats(contactId),
        listGigsByContact(contactId),
        getSupplierIdForContact(contactId),
      ]);
      setContact(c);
      setStats(s);
      setGigs(g);
      setSupplierId(sup);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && contactId) void refresh();
  }, [open, contactId]);

  if (!contactId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {loading || !contact ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ContactPhotoCircle contact={contact} />
                  <div className="space-y-1">
                    <DialogTitle>{contact.name}</DialogTitle>
                    <div className="flex items-center gap-2">
                      <TypeBadges types={contact.types} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(contact)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button size="sm" onClick={() => onCreateGig(contact)}>
                    <Plus className="h-3.5 w-3.5" />
                    Nova GIG com este contato
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                icon={<CalendarRange className="h-4 w-4" />}
                label="GIGs vinculadas"
                value={stats?.gigCount.toString() ?? "0"}
              />
              <Stat
                icon={<DollarSign className="h-4 w-4" />}
                label="Já gerou"
                value={
                  stats ? formatCurrency(stats.totalRevenue ?? 0) : "—"
                }
              />
              <Stat
                icon={<CalendarRange className="h-4 w-4" />}
                label="Última GIG"
                value={
                  stats?.lastGigDate ? formatDate(stats.lastGigDate) : "—"
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
              <Row
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Telefone"
                value={contact.phone}
              />
              <Row
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                value={contact.email}
              />
              <Row
                icon={<Instagram className="h-3.5 w-3.5" />}
                label="Instagram"
                value={contact.instagram}
              />
              <Row
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Cidade"
                value={contact.city}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Prioridade
                </span>
                <Badge
                  variant={
                    ratingToPriority(contact.rating) === "Alta"
                      ? "destructive"
                      : ratingToPriority(contact.rating) === "Média"
                      ? "warning"
                      : "secondary"
                  }
                >
                  {ratingToPriority(contact.rating) ?? "—"}
                </Badge>
              </div>
              {contact.last_interaction_at && (
                <Row
                  icon={<CalendarRange className="h-3.5 w-3.5" />}
                  label="Última interação"
                  value={formatDate(contact.last_interaction_at)}
                />
              )}
            </div>

            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            )}

            {contact.notes && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {contact.notes}
              </div>
            )}

            <Tabs defaultValue="gigs">
              <TabsList className="flex-wrap">
                <TabsTrigger value="gigs">GIGs ({gigs.length})</TabsTrigger>
                <TabsTrigger value="interactions">Interações</TabsTrigger>
                {contact.relationship_types.map((t) => (
                  <TabsTrigger key={t} value={`rel-${t}`}>
                    {RELATION_TAB_LABEL[t]}
                  </TabsTrigger>
                ))}
                {supplierId != null && (
                  <TabsTrigger value="servicos">Serviços</TabsTrigger>
                )}
              </TabsList>

              {contact.relationship_types.map((t) => (
                <TabsContent key={t} value={`rel-${t}`}>
                  <RelationshipTabContent type={t} contact={contact} onSaved={refresh} />
                </TabsContent>
              ))}
              {supplierId != null && (
                <TabsContent value="servicos">
                  <ServicesTabContent supplierId={supplierId} />
                </TabsContent>
              )}

              <TabsContent value="gigs">
                {gigs.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhuma GIG vinculada ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {gigs.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between rounded-md border p-2.5 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            <Link to={`/gigs?open=${g.id}`} className="hover:underline text-primary">
                              {gigDisplayName(g)}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {g.venue_name} · {formatDate(g.date)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(g.cache_amount)}
                          </span>
                          <StatusBadge status={g.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="interactions">
                <InteractionList
                  contactId={contact.id}
                  onChange={refresh}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="truncate">{value ?? "—"}</span>
    </div>
  );
}

function ContactPhotoCircle({ contact }: { contact: Contact }) {
  const url = useImageUrl(contact.photo_path);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={contact.name}
      className="h-16 w-16 rounded-full object-cover"
    />
  );
}
