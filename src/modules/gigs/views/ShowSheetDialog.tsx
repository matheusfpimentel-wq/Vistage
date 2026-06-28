import { useEffect, useState } from "react";
import { CalendarClock, Lightbulb, MapPin, Phone, Printer, ScrollText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { loadFocusPanel, type FocusPanel } from "@/modules/foco/api";
import { listFanListMembers, listFanListsForGig, listFans } from "@/modules/fans/api";
import { gigDisplayName } from "../displayName";
import { getSetlistsForGig } from "../setlist";
import { printShowSheet } from "../showSheetPdf";
import { formatDate } from "@/lib/format";
import type { Gig } from "../types";

type StagePanel = Extract<FocusPanel, { kind: "stage" }>;

/**
 * Show Sheet — a "folha de palco" da GIG: o que importa na hora de tocar
 * (horários do set, contato do dia com WhatsApp, ideias de música). Antes só
 * aparecia dentro de uma sessão de foco "Tempo de palco"; agora é acessível
 * direto pela GIG.
 */
export function ShowSheetDialog({
  gig,
  open,
  onOpenChange,
}: {
  gig: Gig | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [panel, setPanel] = useState<StagePanel | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !gig) {
      setPanel(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void loadFocusPanel({
      activity_type: "Tempo de palco",
      context_type: "gig",
      context_id: gig.id,
    })
      .then((p) => {
        if (alive) setPanel(p && p.kind === "stage" ? p : null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, gig]);

  const wa = panel?.dayContactPhone
    ? `https://wa.me/${panel.dayContactPhone.replace(/\D/g, "")}`
    : null;

  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    if (!gig) return;
    setPrinting(true);
    try {
      // Setlist mais recente da GIG (getSetlistsForGig ordena por imported_at DESC).
      const setlists = await getSetlistsForGig(gig.id);
      const tracks = setlists[0]?.tracks ?? [];

      // Listas VIP / cortesias com os nomes resolvidos (fã cadastrado ou nome livre).
      const vipLists = await listFanListsForGig(gig.id);
      let fans: Awaited<ReturnType<typeof listFans>> = [];
      const needsFans = vipLists.length > 0;
      if (needsFans) {
        fans = await listFans().catch(() => []);
      }
      const resolvedVip = await Promise.all(
        vipLists.map(async (list) => {
          const ms = await listFanListMembers(list.id);
          const members = ms.map((m) =>
            m.fan_id
              ? fans.find((f) => f.id === m.fan_id)?.name ?? m.name ?? "—"
              : m.name ?? "—"
          );
          return { name: list.name, members };
        })
      );

      await printShowSheet(gig, {
        dayContactName: panel?.dayContactName ?? gig.day_contact_name,
        dayContactPhone: panel?.dayContactPhone ?? gig.day_contact_phone,
        slots: panel?.slots ?? [],
        tracks,
        vipLists: resolvedVip,
      });
    } catch (e) {
      toast.error(`Erro ao carregar dados da Show Sheet: ${String(e)}`);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              Show Sheet
            </DialogTitle>
            {gig && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePrint()}
                disabled={printing || loading}
              >
                <Printer className="h-4 w-4" />
                Imprimir Show Sheet
              </Button>
            )}
          </div>
        </DialogHeader>

        {gig && (
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold leading-tight">{gigDisplayName(gig)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <span className="tabular-nums">{formatDate(gig.date)}</span>
                {gig.venue_city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {gig.venue_city}
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">
                Carregando…
              </p>
            ) : (
              <>
                {/* Horários do set */}
                <Section icon={CalendarClock} title="Set">
                  {panel && panel.slots.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {panel.slots.map((s, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-muted px-2 py-1 text-sm tabular-nums"
                        >
                          {s.start || "?"}
                          {s.end ? `–${s.end}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <Empty>Sem horário de set definido.</Empty>
                  )}
                </Section>

                {/* Contato do dia */}
                <Section icon={Phone} title="Contato do dia">
                  {panel?.dayContactName ? (
                    wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline-offset-2 hover:underline"
                      >
                        {panel.dayContactName} · WhatsApp
                      </a>
                    ) : (
                      <span className="text-sm">{panel.dayContactName}</span>
                    )
                  ) : (
                    <Empty>Ninguém definido para o dia.</Empty>
                  )}
                </Section>

                {/* Ideias de música */}
                <Section icon={Lightbulb} title="Ideias de música">
                  {panel && panel.ideas.length > 0 ? (
                    <ul className="space-y-1">
                      {panel.ideas.map((idea, i) => (
                        <li key={i} className="text-sm text-muted-foreground">
                          {idea}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nenhuma ideia anotada na pesquisa da GIG.</Empty>
                  )}
                </Section>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CalendarClock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground/70">{children}</p>;
}
