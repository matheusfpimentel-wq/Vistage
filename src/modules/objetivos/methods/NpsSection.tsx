import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Smile } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { formatDate } from "@/lib/format";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";

// ============================================================
// NPS — feedback do contratante/produtor
//
// Movido da antiga aba "Metodologias" do Dashboard. Por ora é uma reloc fiel
// do NPS atual; a versão detalhada virá num PR seguinte.
// ============================================================

type NpsCategory = "promoters" | "neutrals" | "detractors" | "all";

function npsCategoryOf(g: Gig): Exclude<NpsCategory, "all"> {
  const r = g.rating_contractor ?? 0;
  if (r >= 4) return "promoters";
  if (r <= 2.5) return "detractors";
  return "neutrals";
}

const NPS_CATEGORY_LABEL: Record<NpsCategory, string> = {
  promoters: "Promotores (≥4)",
  neutrals: "Neutros (3)",
  detractors: "Detratores (≤2,5)",
  all: "Todas as avaliações",
};

export function NpsSection() {
  const [gigs, setGigs] = useState<Gig[] | null>(null);

  // Carrega as GIGs e recarrega silenciosamente quando algo muda (ex.: debrief).
  useEffect(() => {
    const reload = () => {
      void listGigs()
        .then(setGigs)
        .catch((e) => console.error("Falha ao carregar NPS", e));
    };
    reload();
    window.addEventListener(DATA_CHANGED, reload);
    return () => window.removeEventListener(DATA_CHANGED, reload);
  }, []);

  if (!gigs) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <NpsCard gigs={gigs} />;
}

function NpsCard({ gigs }: { gigs: Gig[] }) {
  // rating_contractor é uma nota 0..5. Mapeamento para NPS:
  //   >= 4   → promotor
  //   == 3   → neutro
  //   <= 2.5 → detrator
  const [drill, setDrill] = useState<NpsCategory | null>(null);

  const rated = gigs.filter((g) => typeof g.rating_contractor === "number");
  const promoters = rated.filter((g) => (g.rating_contractor ?? 0) >= 4).length;
  const detractors = rated.filter((g) => (g.rating_contractor ?? 0) <= 2.5).length;
  const neutrals = rated.length - promoters - detractors;

  const nps = rated.length > 0
    ? Math.round((promoters / rated.length) * 100 - (detractors / rated.length) * 100)
    : null;

  const tone = nps == null ? "text-muted-foreground" : nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-500" : "text-destructive";
  const verdict = nps == null ? "" : nps >= 50 ? "Excelente" : nps >= 0 ? "Razoável" : "Precisa de atenção";

  const drillGigs = drill == null
    ? []
    : (drill === "all" ? rated : rated.filter((g) => npsCategoryOf(g) === drill))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smile className="h-4 w-4 text-primary" />
            NPS dos contratantes
          </CardTitle>
          <CardDescription>
            Calculado a partir da "Avaliação do Contratante" registrada no debrief das GIGs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rated.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma GIG com avaliação de contratante ainda. Preencha no debrief.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <button
                type="button"
                onClick={() => setDrill("all")}
                className="rounded-md px-1 text-left transition-colors hover:bg-muted/50"
                title="Ver todas as GIGs avaliadas"
              >
                <div className={cn("text-4xl font-bold tabular-nums", tone)}>{nps}</div>
                <div className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {verdict} · {rated.length} avaliações
                </div>
              </button>
              <div className="flex-1 space-y-1.5 min-w-48">
                <NpsBar label={NPS_CATEGORY_LABEL.promoters} count={promoters} total={rated.length} tone="bg-emerald-500" onClick={() => promoters > 0 && setDrill("promoters")} />
                <NpsBar label={NPS_CATEGORY_LABEL.neutrals} count={neutrals} total={rated.length} tone="bg-amber-400" onClick={() => neutrals > 0 && setDrill("neutrals")} />
                <NpsBar label={NPS_CATEGORY_LABEL.detractors} count={detractors} total={rated.length} tone="bg-destructive" onClick={() => detractors > 0 && setDrill("detractors")} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={drill != null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{drill ? NPS_CATEGORY_LABEL[drill] : ""}</DialogTitle>
            <DialogDescription>
              {drillGigs.length} GIG{drillGigs.length === 1 ? "" : "s"} com avaliação do contratante.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {drillGigs.map((g) => (
              <Link
                key={g.id}
                to={`/gigs?debrief=${g.id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{gigDisplayName(g)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(g.date)}
                    {g.venue_city ? ` · ${g.venue_city}` : ""}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-semibold">
                  {g.rating_contractor?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / 5
                </span>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NpsBar({ label, count, total, tone, onClick }: { label: string; count: number; total: number; tone: string; onClick?: () => void }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const clickable = onClick && count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1 text-left transition-colors",
        clickable ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
      )}
      title={clickable ? `Ver GIGs · ${label}` : undefined}
    >
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{count} ({pct}%)</span>
    </button>
  );
}
