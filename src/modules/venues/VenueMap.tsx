import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { geocodeVenue, saveVenueCoords } from "./api";
import type { Venue } from "./types";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default marker icons quebrados no Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

type Props = {
  venues: Venue[];
  onOpenDetail: (v: Venue) => void;
  onRefresh: () => void;
};

export function VenueMap({ venues, onOpenDetail, onRefresh }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [geocoding, setGeocoding] = useState<number | null>(null);

  const mapped = venues.filter((v) => v.lat != null && v.lng != null);
  const unmapped = venues.filter((v) => v.lat == null || v.lng == null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current).setView([-15.77972, -47.92972], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(leafletMap.current);
    }

    // Limpa markers anteriores
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const v of mapped) {
      const marker = L.marker([v.lat!, v.lng!])
        .addTo(leafletMap.current!)
        .bindPopup(buildPopup(v));
      marker.on("popupopen", () => {
        const btn = document.getElementById(`venue-detail-${v.id}`);
        btn?.addEventListener("click", () => onOpenDetail(v));
      });
      markersRef.current.push(marker);
    }

    // Fit bounds se tiver venues mapeados
    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map((v) => [v.lat!, v.lng!]));
      leafletMap.current!.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapped.map((v) => v.id).join(",")]);

  async function handleGeocode(venue: Venue) {
    setGeocoding(venue.id);
    try {
      const coords = await geocodeVenue(venue);
      if (!coords) {
        toast.error(`Não foi possível geocodificar "${venue.name}". Tente editar cidade/nome.`);
        return;
      }
      await saveVenueCoords(venue.id, coords.lat, coords.lng);
      toast.success(`"${venue.name}" posicionado no mapa`);
      onRefresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setGeocoding(null);
    }
  }

  async function handleGeocodeAll() {
    for (const v of unmapped) {
      setGeocoding(v.id);
      try {
        const coords = await geocodeVenue(v);
        if (coords) await saveVenueCoords(v.id, coords.lat, coords.lng);
        // Nominatim pede 1 req/s
        await new Promise((r) => setTimeout(r, 1100));
      } catch {
        // continua pro próximo
      }
    }
    setGeocoding(null);
    toast.success("Geocoding concluído");
    onRefresh();
  }

  return (
    <div className="space-y-4">
      {/* Mapa */}
      <div
        ref={mapRef}
        className="h-[500px] w-full rounded-lg border overflow-hidden"
        style={{ zIndex: 0 }}
      />

      {/* Venues sem coordenadas */}
      {unmapped.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {unmapped.length} venue{unmapped.length > 1 ? "s" : ""} sem posição no mapa
            </p>
            {unmapped.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGeocodeAll}
                disabled={geocoding !== null}
              >
                {geocoding !== null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                Geocodificar todos
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {unmapped.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-sm"
              >
                <span className="text-muted-foreground">{v.name}</span>
                {v.city && (
                  <span className="text-xs text-muted-foreground">({v.city})</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => handleGeocode(v)}
                  disabled={geocoding !== null}
                >
                  {geocoding === v.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  Localizar
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Geocoding usa OpenStreetMap/Nominatim — gratuito, sem API key.
            Certifique-se de que o nome da cidade está preenchido.
          </p>
        </div>
      )}
    </div>
  );
}

function buildPopup(v: Venue): string {
  const lines: string[] = [];
  lines.push(`<strong style="font-size:13px">${v.name}</strong>`);
  if (v.city || v.state) {
    lines.push(
      `<span style="color:#888;font-size:12px">${[v.city, v.state].filter(Boolean).join(" / ")}</span>`
    );
  }
  if (v.capacity) {
    lines.push(`<span style="font-size:12px">Cap. ${v.capacity}</span>`);
  }
  lines.push(
    `<br/><button id="venue-detail-${v.id}" style="margin-top:4px;font-size:12px;color:#7c3aed;background:none;border:none;cursor:pointer;padding:0">Ver detalhes →</button>`
  );
  return lines.join("<br/>");
}
