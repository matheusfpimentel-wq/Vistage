import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import {
  DEFAULT_NAV,
  NAV_GROUP_META,
  modulesInGroup,
  type NavGroup,
} from "@/lib/nav";
import { useHiddenModules } from "@/lib/moduleVisibility";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
// Criação
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { listParties } from "@/modules/parties/api";
import { listClasses } from "@/modules/classes/api";
// Relacionamento
import { listContacts } from "@/modules/crm/api";
import { ratingToPriority } from "@/modules/crm/types";
import { listSuppliers } from "@/modules/suppliers/api";
import { getFanStats } from "@/modules/fans/api";
import { listVenues } from "@/modules/venues/api";
import { listTracks, daysInStage } from "@/modules/music/api";
import { trackDisplayName } from "@/modules/music/types";
import { listContent } from "@/modules/content/api";
// Gestão
import { loadFinanceInsights } from "@/modules/finance/api";
import { listOkrs, currentQuarter, okrProgress } from "@/modules/objetivos/api";
import { loadActivityStats } from "@/modules/foco/api";

// ============================================================
// Descrições curtas de cada módulo (lista de módulos do grupo)
// ============================================================

const MODULE_DESC: Record<string, string> = {
  "/gigs": "Agenda, propostas e debriefs",
  "/festas": "Produção de eventos próprios",
  "/aulas": "Aulas e alunos",
  "/tarefas": "To-dos e prazos",
  "/pessoas": "Contatos e fornecedores",
  "/venues": "Locais e casas de show",
  "/fas": "Clube de fãs e superfãs",
  "/musica": "Pipeline de produção musical",
  "/conteudo": "Calendário de conteúdo",
  "/ideias": "Ideias, insights e captura",
  "/financeiro": "Receitas, despesas e fluxo",
  "/objetivos": "OKRs e metas do trimestre",
  "/relatorio": "Resumo mensal do projeto",
  "/foco": "Sessões de energia e foco",
  "/identidade": "Marca e identidade artística",
};

// ============================================================
// Hook de carregamento (recarrega no DATA_CHANGED)
// ============================================================

function useAsync<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(() => {
    setLoading(true);
    void load()
      .then(setData)
      .catch(() => setData(null)) // sem isto, uma query que rejeita vira unhandled e os dados nunca carregam
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    run();
    const onChange = () => run();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [run]);

  return { data, loading, reload: run };
}

// ============================================================
// Apresentação — apenas TEXTO (sem cards/KPIs/badges/barras).
// As seções temáticas voltaram a ser texto puro: os mesmos números e listas,
// só que como linhas de texto navegáveis, sem o painel visual.
// ============================================================

function GroupShell({
  group,
  loading,
  onReload,
  children,
}: {
  group: NavGroup;
  loading: boolean;
  onReload: () => void;
  children: React.ReactNode;
}) {
  const meta = NAV_GROUP_META[group];
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold leading-tight">{group}</h2>
          <p className="text-sm text-muted-foreground">{meta.tagline}</p>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
          aria-label="Atualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>
      {children}
    </div>
  );
}

type StatItem = { label: string; value: React.ReactNode; hint?: React.ReactNode; to: string };

function StatsText({ items }: { items: StatItem[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((it) => (
        <li key={it.label}>
          <Link to={it.to} className="hover:underline">
            <span className="text-muted-foreground">{it.label}:</span>{" "}
            <span className="font-medium tabular-nums">{it.value}</span>
            {it.hint != null && it.hint !== "" && (
              <span className="text-muted-foreground"> — {it.hint}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TextSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {empty ? (
        <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
      ) : (
        <ul className="space-y-1 text-sm">{children}</ul>
      )}
    </div>
  );
}

/** Uma linha de texto navegável: nome em destaque + contexto esmaecido. */
function TextRow({ to, name, context }: { to: string; name: string; context?: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="hover:underline">
        <span className="font-medium">{name}</span>
        {context != null && context !== "" && (
          <span className="text-muted-foreground"> — {context}</span>
        )}
      </Link>
    </li>
  );
}

function ModuleLinks({ group }: { group: NavGroup }) {
  // Perfil: módulos de CRIAÇÃO ocultos não aparecem na lista do hub do grupo.
  const hidden = useHiddenModules();
  const modules = modulesInGroup(DEFAULT_NAV, group).filter((m) => !hidden.has(m.to));
  return (
    <TextSection title="Módulos" empty={modules.length === 0}>
      {modules.map(({ to, label }) => (
        <TextRow key={to} to={to} name={label} context={MODULE_DESC[to] ?? ""} />
      ))}
    </TextSection>
  );
}

function CenterLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

// ============================================================
// Relacionamento
// ============================================================

export function RelacionamentoDashboard() {
  const load = useCallback(async () => {
    const [contacts, suppliers, fanStats, venues] = await Promise.all([
      listContacts(),
      listSuppliers(),
      getFanStats(),
      listVenues(),
    ]);
    return { contacts, suppliers, fanStats, venues };
  }, []);
  const { data, loading, reload } = useAsync(load);

  return (
    <GroupShell group="Relacionamento" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const highPriority = data.contacts.filter(
            (c) => ratingToPriority(c.rating) === "Alta"
          );
          const totalFans =
            data.fanStats.superfa + data.fanStats.fa + data.fanStats.possivelFa;

          return (
            <>
              <StatsText
                items={[
                  { label: "Contatos", value: data.contacts.length, to: "/pessoas?role=Contato", hint: `${highPriority.length} de prioridade alta` },
                  { label: "Venues", value: data.venues.length, to: "/venues" },
                  { label: "Fornecedores", value: data.suppliers.length, to: "/pessoas?role=Fornecedor" },
                  { label: "Superfãs", value: data.fanStats.superfa, to: "/fas", hint: `${totalFans} fãs no total` },
                ]}
              />

              <TextSection
                title="Contatos de prioridade alta"
                empty={highPriority.length === 0}
              >
                {highPriority.slice(0, 6).map((c) => (
                  <TextRow key={c.id} to={`/pessoas?open=${c.id}`} name={c.name} context={c.types[0] ?? "—"} />
                ))}
              </TextSection>

              <ModuleLinks group="Relacionamento" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}

// ============================================================
// Criação
// ============================================================

export function CriacaoDashboard() {
  const load = useCallback(async () => {
    const [gigs, parties, classes, tracks, content] = await Promise.all([
      listGigs(),
      listParties(),
      listClasses(),
      listTracks(),
      listContent(),
    ]);
    return { gigs, parties, classes, tracks, content };
  }, []);
  const { data, loading, reload } = useAsync(load);
  const today = todayISO();
  // Perfil: módulos de CRIAÇÃO ocultos não contribuem pro hub do grupo.
  const hidden = useHiddenModules();

  return (
    <GroupShell group="Criação" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const upcomingGigs = data.gigs
            .filter(
              (g) =>
                g.date >= today &&
                (g.status === "Proposta" || g.status === "Confirmada")
            )
            .sort((a, b) => a.date.localeCompare(b.date));
          const activeTracks = data.tracks.filter((t) => !t.standby);
          const pipeline = data.content.filter(
            (c) => c.status !== "Publicado" && c.status !== "Arquivado"
          );
          const published = data.content.filter((c) => c.status === "Publicado");
          const upcomingClasses = data.classes.filter(
            (c) => c.status === "Agendada" && c.date >= today
          );

          return (
            <>
              <StatsText
                items={[
                  {
                    label: "GIGs futuras",
                    value: upcomingGigs.length,
                    to: "/gigs",
                    hint: upcomingGigs[0] ? `Próxima: ${formatDate(upcomingGigs[0].date)}` : "Nada agendado",
                  },
                  {
                    label: "Tracks ativas",
                    value: activeTracks.length,
                    to: "/musica",
                    hint: `${data.tracks.length - activeTracks.length} em standby`,
                  },
                  {
                    label: "Conteúdo no pipeline",
                    value: pipeline.length,
                    to: "/conteudo",
                    hint: `${published.length} publicados`,
                  },
                  {
                    label: "Aulas agendadas",
                    value: upcomingClasses.length,
                    to: "/aulas",
                    hint: `${data.parties.filter((p) => p.date && p.date >= today && p.status !== "Cancelada").length} festa(s) em andamento`,
                  },
                ].filter((it) => !it.to || !hidden.has(it.to))}
              />

              {!hidden.has("/gigs") && (
                <TextSection title="Próximas GIGs" empty={upcomingGigs.length === 0}>
                  {upcomingGigs.slice(0, 5).map((g) => (
                    <TextRow
                      key={g.id}
                      to={`/gigs?open=${g.id}`}
                      name={gigDisplayName(g)}
                      context={`${g.venue_name} · ${formatDate(g.date)} · ${g.status}`}
                    />
                  ))}
                </TextSection>
              )}

              {!hidden.has("/musica") && (
                <TextSection title="Tracks ativas" empty={activeTracks.length === 0}>
                  {activeTracks.slice(0, 6).map((t) => {
                    const d = daysInStage(t);
                    const stage = t.current_stage ?? "—";
                    return (
                      <TextRow
                        key={t.id}
                        to="/musica"
                        name={trackDisplayName(t)}
                        context={d !== null ? `${stage} · ${d}d no stage` : stage}
                      />
                    );
                  })}
                </TextSection>
              )}

              <ModuleLinks group="Criação" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}

// ============================================================
// Produtividade (Gestão + Foco + Objetivos)
// ============================================================

export function GestaoDashboard() {
  const load = useCallback(async () => {
    const [fin, okrs, activity] = await Promise.all([
      loadFinanceInsights(),
      listOkrs(),
      loadActivityStats(),
    ]);
    return { fin, okrs, activity };
  }, []);
  const { data, loading, reload } = useAsync(load);

  return (
    <GroupShell group="Produtividade" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const quarter = currentQuarter();
          const current = data.okrs.filter((o) => o.quarter === quarter);
          const shownOkrs = current.length > 0 ? current : data.okrs;
          const avgPct =
            shownOkrs.length > 0
              ? Math.round(
                  (shownOkrs.reduce((s, o) => s + okrProgress(o), 0) /
                    shownOkrs.length) *
                    100
                )
              : null;
          const totalMinutes = data.activity.reduce(
            (s, a) => s + (a.total_minutes ?? 0),
            0
          );
          const focusHours = Math.round(totalMinutes / 60);

          return (
            <>
              <StatsText
                items={[
                  { label: "Receita do mês", value: formatCurrency(data.fin.monthIncome), to: "/financeiro" },
                  { label: "Saldo do mês", value: formatCurrency(data.fin.monthBalance), to: "/financeiro" },
                  { label: "OKRs", value: avgPct !== null ? `${avgPct}%` : "—", to: "/objetivos", hint: `${shownOkrs.length} objetivo(s) · ${quarter}` },
                  { label: "Horas de foco", value: `${focusHours}h`, to: "/foco", hint: `${data.activity.reduce((s, a) => s + (a.sessions ?? 0), 0)} sessões` },
                ]}
              />

              <TextSection title={`OKRs · ${quarter}`} empty={shownOkrs.length === 0}>
                {shownOkrs.map((o) => (
                  <TextRow
                    key={o.id}
                    to="/objetivos"
                    name={o.objective}
                    context={`${Math.round(okrProgress(o) * 100)}%`}
                  />
                ))}
              </TextSection>

              <ModuleLinks group="Produtividade" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}
