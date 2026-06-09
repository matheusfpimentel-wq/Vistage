import { useEffect, useState } from "react";
import { X, Phone, Music2, Clock, MapPin } from "lucide-react";
import { readStageModeParams } from "./stageMode";
import { getGig, listGigTracks } from "./api";
import { getTrack } from "@/modules/music/api";
import { gigDisplayName } from "./displayName";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Gig } from "./types";
import type { Track } from "@/modules/music/types";

function trackDisplayTitle(t: Track): string {
  return (t.title_final && t.title_final.trim()) || t.title_working;
}

/**
 * Mini-janela always-on-top "Modo Palco": setlist + horário + contato do dia.
 * Aberta a partir do GigForm/GigsPage via openStageMode().
 */
export function StageOverlay() {
  const params = readStageModeParams();
  const [gig, setGig] = useState<Gig | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [now, setNow] = useState(new Date());

  // Apply theme
  useEffect(() => {
    if (!params) return;
    if (params.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [params?.theme]);

  // Load gig + tracks
  useEffect(() => {
    if (!params?.gigId) return;
    void (async () => {
      const g = await getGig(params.gigId);
      if (!g) return;
      setGig(g);
      const trackIds = await listGigTracks(g.id);
      const loaded = await Promise.all(trackIds.map((id) => getTrack(id)));
      setTracks(loaded.filter(Boolean) as Track[]);
    })();
  }, [params?.gigId]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  async function closeWindow() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch { /* nada */ }
  }

  if (!params || !gig) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-background text-foreground select-none"
      data-tauri-drag-region
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        data-tauri-drag-region
      >
        <div className="min-w-0 flex-1" data-tauri-drag-region>
          <div className="truncate text-sm font-semibold">{gigDisplayName(gig)}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(gig.date)}</span>
            {gig.start_time && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {gig.start_time.slice(0, 5)}
              </span>
            )}
            {gig.venue_city && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {gig.venue_city}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pl-2 shrink-0">
          <span className="tabular-nums text-sm font-mono text-muted-foreground">{timeStr}</span>
          <button
            type="button"
            onClick={() => void closeWindow()}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contato do dia */}
      {(gig.day_contact_name || gig.day_contact_phone) && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
          <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="font-medium">{gig.day_contact_name ?? "Contato do dia"}</span>
          {gig.day_contact_phone && (
            <span className="ml-auto text-muted-foreground">{gig.day_contact_phone}</span>
          )}
        </div>
      )}

      {/* Setlist */}
      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs px-4 text-center">
            <Music2 className="h-8 w-8 opacity-30" />
            <span>Nenhuma música no setlist desta GIG.</span>
          </div>
        ) : (
          <ol className="space-y-0 py-1">
            {tracks.map((t, idx) => (
              <li
                key={t.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                )}
              >
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <span className="flex-1 truncate font-medium">{trackDisplayTitle(t)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-1.5 text-center text-[10px] text-muted-foreground/60">
        {tracks.length > 0 ? `${tracks.length} música${tracks.length !== 1 ? "s" : ""}` : "Modo Palco"}
        {gig.venue_name ? ` · ${gig.venue_name}` : ""}
      </div>
    </div>
  );
}
