import { cn } from "@/lib/utils";
import { STAGE_COLOR } from "../stages";
import { trackDisplayName, type MusicProject, type TrackWithProject } from "../types";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Props = {
  tracks: TrackWithProject[];
  projects: MusicProject[];
};

type MarketingDates = {
  release?: string | null;
  [key: string]: unknown;
};

function parseMarketingDates(raw: string | null): MarketingDates {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MarketingDates;
  } catch {
    return {};
  }
}

function toYYYYMM(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function generate12Months(): { key: string; label: string }[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      key: toYYYYMM(d),
      label: `${MONTH_LABELS[d.getMonth()]}/${d.getFullYear()}`,
    });
  }
  return months;
}

export function RoadmapView({ tracks, projects }: Props) {
  const months = generate12Months();
  const currentMonthKey = months[0].key;

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const buckets = new Map<string, TrackWithProject[]>(months.map((m) => [m.key, []]));

  for (const track of tracks) {
    const proj = projectMap.get(track.project_id);
    const md = parseMarketingDates(proj?.marketing_dates ?? null);
    const releaseDate = md.release ? String(md.release) : null;

    if (releaseDate) {
      const monthKey = releaseDate.slice(0, 7);
      if (buckets.has(monthKey)) {
        buckets.get(monthKey)!.push(track);
      }
    } else if (
      track.current_stage === "Pré-lançamento" ||
      track.current_stage === "Lançamento"
    ) {
      buckets.get(currentMonthKey)!.push(track);
    }
  }

  const hasAny = [...buckets.values()].some((b) => b.length > 0);

  if (!hasAny) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed py-16 text-sm text-muted-foreground">
        Adicione datas de lançamento no painel Marketing das tracks.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3" style={{ minWidth: "max-content" }}>
        {months.map(({ key, label }) => {
          const items = buckets.get(key)!;
          return (
            <div
              key={key}
              className="flex min-w-[160px] flex-col gap-2 rounded-md border bg-muted/20 p-3"
            >
              <div>
                <p className="text-sm font-semibold leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {items.length} track{items.length !== 1 ? "s" : ""}
                </p>
              </div>
              {items.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="rounded border bg-background px-2 py-1.5"
                    >
                      <p className="truncate text-xs font-medium leading-tight">
                        {trackDisplayName(t)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t.project_title}
                      </p>
                      <span
                        className={cn(
                          "mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                          STAGE_COLOR[t.current_stage]
                        )}
                      >
                        {t.current_stage}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
