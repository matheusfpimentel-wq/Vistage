import { useEffect, useState } from "react";
import { Instagram, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { LevelBadge } from "../components/LevelBadge";
import { FanInteractionList } from "../components/FanInteractionList";
import { getFan } from "../api";
import { getContact } from "@/modules/crm/api";
import type { Fan } from "../types";
import { formatDate } from "@/lib/format";
import { useImageUrl } from "@/lib/uploads";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fanId: number | null;
  onEdit: (fan: Fan) => void;
};

export function FanDetail({ open, onOpenChange, fanId, onEdit }: Props) {
  const [fan, setFan] = useState<Fan | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!fanId) return;
    setLoading(true);
    try {
      const f = await getFan(fanId);
      setFan(f);
      if (f?.contact_id != null) {
        const c = await getContact(f.contact_id);
        setContactName(c?.name ?? null);
      } else {
        setContactName(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && fanId) void refresh();
  }, [open, fanId]);

  if (!fanId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {loading || !fan ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FanPhotoCircle fan={fan} />
                  <div className="space-y-1">
                    <DialogTitle>{fan.name}</DialogTitle>
                    <LevelBadge level={fan.level} />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => onEdit(fan)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
              {fan.instagram && (
                <Row
                  icon={<Instagram className="h-3.5 w-3.5" />}
                  label="Instagram"
                  value={fan.instagram}
                />
              )}
              {fan.phone && (
                <Row
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Telefone"
                  value={fan.phone}
                />
              )}
              {fan.email && (
                <Row
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={fan.email}
                />
              )}
              {fan.city && (
                <Row
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Cidade"
                  value={fan.city}
                />
              )}
              {fan.last_interaction_at && (
                <Row
                  label="Último contato"
                  value={formatDate(fan.last_interaction_at)}
                />
              )}
              {fan.contact_id != null && contactName && (
                <Row label="Contato CRM" value={contactName} />
              )}
            </div>

            {fan.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {fan.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            )}

            {fan.notes && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {fan.notes}
              </div>
            )}

            <Tabs defaultValue="interactions">
              <TabsList>
                <TabsTrigger value="interactions">Interações</TabsTrigger>
              </TabsList>

              <TabsContent value="interactions">
                <FanInteractionList fanId={fan.id} onChange={refresh} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="truncate">{value}</span>
    </div>
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
