import { useEffect, useState } from "react";
import {
  CalendarRange,
  DollarSign,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Star,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getVenue, getVenueStats, listGigsByVenue } from "../api";
import type { Venue, VenueStats } from "../types";
import type { Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { formatCurrency, formatDate, formatRating } from "@/lib/format";
import { open as openExternal } from "@tauri-apps/plugin-shell";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: number | null;
  onEdit: (venue: Venue) => void;
};

export function VenueDetail({ open, onOpenChange, venueId, onEdit }: Props) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [stats, setStats] = useState<VenueStats | null>(null);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!venueId) return;
    setLoading(true);
    try {
      const [v, s, g] = await Promise.all([
        getVenue(venueId),
        getVenueStats(venueId),
        listGigsByVenue(venueId),
      ]);
      setVenue(v);
      setStats(s);
      setGigs(g);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && venueId) void refresh();
  }, [open, venueId]);

  if (!venueId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {loading || !venue ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <DialogTitle>{venue.name}</DialogTitle>
                  <div className="text-sm text-muted-foreground">
                    {[venue.city, venue.state, venue.country]
                      .filter(Boolean)
                      .join(" · ")}
                    {venue.capacity && ` · cap. ${venue.capacity}`}
                    {venue.founded_year && ` · desde ${venue.founded_year}`}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => onEdit(venue)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              </div>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-4">
              <Stat
                icon={<CalendarRange className="h-4 w-4" />}
                label="GIGs"
                value={stats?.gigCount.toString() ?? "0"}
              />
              <Stat
                icon={<DollarSign className="h-4 w-4" />}
                label="Já gerou"
                value={stats ? formatCurrency(stats.totalRevenue ?? 0) : "—"}
              />
              <Stat
                icon={<Star className="h-4 w-4 text-amber-500" />}
                label="Avaliação média"
                value={stats?.avgRating ? formatRating(stats.avgRating) : "—"}
              />
              <Stat
                icon={<CalendarRange className="h-4 w-4" />}
                label="Última GIG"
                value={stats?.lastGigDate ? formatDate(stats.lastGigDate) : "—"}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
              {venue.address && (
                <Row
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Endereço"
                  value={venue.address}
                />
              )}
              {venue.owner_name && (
                <Row
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Dono"
                  value={venue.owner_name}
                />
              )}
              {venue.owner_phone && (
                <Row
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Tel. dono"
                  value={venue.owner_phone}
                />
              )}
              {venue.owner_email && (
                <Row
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email dono"
                  value={venue.owner_email}
                />
              )}
              {venue.instagram && (
                <Row label="Instagram" value={venue.instagram} />
              )}
              {venue.website && (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Site
                  </span>
                  <button
                    onClick={() =>
                      openExternal(venue.website!).catch(() => {})
                    }
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {venue.website}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {venue.notes && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {venue.notes}
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium">GIGs nesta casa</h4>
                <Badge variant="outline">{gigs.length}</Badge>
              </div>
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
                          {formatDate(g.date)}
                          {g.main_goal && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              🎯 {g.main_goal}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {g.start_time && `${g.start_time}–${g.end_time ?? "?"}`}
                          {g.estimated_audience &&
                            ` · ${g.estimated_audience} pessoas`}
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
            </div>
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
