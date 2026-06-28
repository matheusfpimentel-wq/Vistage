import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ClipboardList,
  MessageSquare,
  MessageSquareWarning,
  RefreshCw,
  Smile,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { formatDate, toLocalISODate } from "@/lib/format";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";
import {
  addNpsResponse,
  deleteNpsResponse,
  listNpsResponses,
  type NpsResponse,
} from "./npsSurvey";

// ============================================================
// NPS — feedback do contratante/produtor
//
// Derivado de `rating_contractor` das GIGs (a "pesquisa NPS própria" virá em
// outro PR). Além da visão geral (headline + barras + drill-down), três cortes
// detalhados em sub-abas: tendência no tempo, quebra por venue/contratante e a
// lista acionável de detratores com comentário.
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

/**
 * Fórmula única do NPS (evita duplicar promotores% − detratores% por aí).
 * Recebe só as GIGs já avaliadas; retorna o score arredondado (-100..100) e a
 * contagem por categoria. `nps` é null quando não há avaliações.
 */
function npsScore(rated: Gig[]): {
  nps: number | null;
  promoters: number;
  neutrals: number;
  detractors: number;
  count: number;
} {
  const promoters = rated.filter((g) => (g.rating_contractor ?? 0) >= 4).length;
  const detractors = rated.filter((g) => (g.rating_contractor ?? 0) <= 2.5).length;
  const neutrals = rated.length - promoters - detractors;
  const nps = rated.length > 0
    ? Math.round((promoters / rated.length) * 100 - (detractors / rated.length) * 100)
    : null;
  return { nps, promoters, neutrals, detractors, count: rated.length };
}

/**
 * Tom/veredito do score, reaproveitado pelo headline e pela quebra por grupo.
 * Exportados também para a sub-aba "Pesquisa própria" (mesma faixa -100..100).
 */
export function npsTone(nps: number | null): string {
  if (nps == null) return "text-muted-foreground";
  return nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-500" : "text-destructive";
}

export function npsVerdict(nps: number | null): string {
  if (nps == null) return "";
  return nps >= 50 ? "Excelente" : nps >= 0 ? "Razoável" : "Precisa de atenção";
}

/** Comentário do contratante: feedback do debrief, com fallback nos aprendizados. */
function npsComment(g: Gig): string {
  return g.debrief_promoter_feedback?.trim() || g.debrief_learnings?.trim() || "—";
}

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
  const rated = useMemo(
    () => gigs.filter((g) => typeof g.rating_contractor === "number"),
    [gigs]
  );
  const { nps, promoters, neutrals, detractors } = useMemo(() => npsScore(rated), [rated]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smile className="h-4 w-4 text-primary" />
          NPS dos contratantes
        </CardTitle>
        <CardDescription>
          Derivado da "Avaliação do Contratante" do debrief das GIGs (escala 0-5). A aba
          "Pesquisa própria" guarda, à parte, um NPS clássico 0-10 registrado à mão.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* As abas DERIVADAS (das GIGs, escala 0-5) só fazem sentido com avaliações;
            a "Pesquisa própria" (NPS manual 0-10) é fonte independente e aparece
            sempre, por isso fica fora do empty-state das demais. */}
        <Tabs defaultValue={rated.length === 0 ? "survey" : "overview"} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-0.5">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="trend">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              Tendência
            </TabsTrigger>
            <TabsTrigger value="groups">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Grupos
            </TabsTrigger>
            <TabsTrigger value="detractors">
              <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
              Detratores
              {detractors > 0 ? (
                <Badge variant="destructive" className="ml-1.5 px-1.5">
                  {detractors}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="survey">
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              Pesquisa própria
            </TabsTrigger>
          </TabsList>

          {rated.length === 0 ? (
            <TabsContent value="overview">
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhuma GIG com avaliação de contratante ainda. Preencha no debrief — ou
                use a aba "Pesquisa própria" para registrar respostas de NPS à mão.
              </p>
            </TabsContent>
          ) : (
            <>
              <TabsContent value="overview">
                <OverviewTab
                  rated={rated}
                  nps={nps}
                  promoters={promoters}
                  neutrals={neutrals}
                  detractors={detractors}
                />
              </TabsContent>

              <TabsContent value="trend">
                <TrendTab rated={rated} />
              </TabsContent>

              <TabsContent value="groups">
                <GroupsTab rated={rated} />
              </TabsContent>

              <TabsContent value="detractors">
                <DetractorsTab rated={rated} />
              </TabsContent>
            </>
          )}

          <TabsContent value="survey">
            <SurveyTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------
// Visão geral — headline + barras + drill-down (o NPS "clássico").
// ------------------------------------------------------------

function OverviewTab({
  rated,
  nps,
  promoters,
  neutrals,
  detractors,
}: {
  rated: Gig[];
  nps: number | null;
  promoters: number;
  neutrals: number;
  detractors: number;
}) {
  const [drill, setDrill] = useState<NpsCategory | null>(null);

  const tone = npsTone(nps);
  const verdict = npsVerdict(nps);

  const drillGigs = drill == null
    ? []
    : (drill === "all" ? rated : rated.filter((g) => npsCategoryOf(g) === drill))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
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

// ------------------------------------------------------------
// Corte 1 — Tendência no tempo (NPS por mês).
// ------------------------------------------------------------

const MES_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "YYYY-MM" → "jun/26" (mesmo formato dos gráficos do dashboard). */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MES_ABBR[(m - 1) % 12]}/${String(y).slice(2)}`;
}

type TrendPoint = { month: string; label: string; nps: number; count: number };

/**
 * Agrupa as GIGs avaliadas pelo mês de `g.date` e calcula o NPS de cada mês.
 * Só inclui meses que têm avaliação (não preenche buracos), em ordem cronológica.
 */
function buildTrend(rated: Gig[]): TrendPoint[] {
  const byMonth = new Map<string, Gig[]>();
  for (const g of rated) {
    const ym = g.date.slice(0, 7); // "YYYY-MM"
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const bucket = byMonth.get(ym);
    if (bucket) bucket.push(g);
    else byMonth.set(ym, [g]);
  }
  return [...byMonth.keys()]
    .sort()
    .map((ym) => {
      const { nps, count } = npsScore(byMonth.get(ym)!);
      return { month: ym, label: monthLabel(ym), nps: nps ?? 0, count };
    });
}

function TrendTab({ rated }: { rated: Gig[] }) {
  const trend = useMemo(() => buildTrend(rated), [rated]);

  // Amostra esparsa: com 0 ou 1 mês avaliado a linha não diz nada. Avisa em vez
  // de desenhar um gráfico praticamente vazio.
  if (trend.length < 2) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Poucos dados pra tendência. Avalie GIGs em pelo menos dois meses diferentes
          para ver a evolução do NPS no tempo.
        </p>
        {trend.length === 1 ? (
          <p className="text-center text-xs text-muted-foreground">
            Único mês com avaliação: {trend[0].label} — NPS {trend[0].nps} ({trend[0].count}{" "}
            avaliação{trend[0].count === 1 ? "" : "es"}).
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            width={36}
            domain={[-100, 100]}
            ticks={[-100, -50, 0, 50, 100]}
          />
          {/* Linha do zero: acima = saldo de promotores, abaixo = de detratores. */}
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, _name, item) => {
              const count = (item?.payload as TrendPoint | undefined)?.count ?? 0;
              return [`NPS ${value} · ${count} avaliação${count === 1 ? "" : "es"}`, "Mês"];
            }}
          />
          <Line
            type="monotone"
            dataKey="nps"
            name="NPS"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground">
        Meses com 1 avaliação ficam em 100 ou -100 — confira a contagem no tooltip antes
        de tirar conclusões.
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Corte 2 — Quebra por venue / contratante.
// ------------------------------------------------------------

type GroupKind = "venue" | "promoter";

type NpsGroup = { name: string; nps: number; count: number };

/**
 * Agrupa as GIGs avaliadas por venue ou contratante e calcula o NPS de cada
 * grupo. Ignora registros sem nome (null/vazio) e ordena do melhor pro pior NPS
 * (desempate pela maior amostra, pra grupos de 1 avaliação não dominarem o topo).
 */
function buildGroups(rated: Gig[], kind: GroupKind): NpsGroup[] {
  const keyOf = (g: Gig) =>
    (kind === "venue" ? g.venue_name : g.promoter_contact_name)?.trim() ?? "";
  const byKey = new Map<string, Gig[]>();
  for (const g of rated) {
    const key = keyOf(g);
    if (!key) continue; // ignora grupos sem nome
    const bucket = byKey.get(key);
    if (bucket) bucket.push(g);
    else byKey.set(key, [g]);
  }
  return [...byKey.entries()]
    .map(([name, gs]) => ({ name, nps: npsScore(gs).nps ?? 0, count: gs.length }))
    .sort((a, b) => b.nps - a.nps || b.count - a.count);
}

function GroupsTab({ rated }: { rated: Gig[] }) {
  const [kind, setKind] = useState<GroupKind>("venue");
  const groups = useMemo(() => buildGroups(rated, kind), [rated, kind]);

  return (
    <div className="space-y-3">
      {/* Toggle "Por venue | Por contratante". */}
      <div className="inline-flex rounded-lg bg-muted/70 p-1 text-sm">
        <button
          type="button"
          onClick={() => setKind("venue")}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            kind === "venue" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
        >
          Por venue
        </button>
        <button
          type="button"
          onClick={() => setKind("promoter")}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            kind === "promoter" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
        >
          Por contratante
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhuma GIG avaliada com {kind === "venue" ? "venue" : "contratante"} preenchido.
        </p>
      ) : (
        <div className="space-y-1.5">
          {groups.map((grp) => (
            <NpsGroupRow key={grp.name} group={grp} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Ordenado do melhor pro pior NPS. Pese a contagem: um grupo com 1 avaliação vira
        100 ou -100.
      </p>
    </div>
  );
}

function NpsGroupRow({ group }: { group: NpsGroup }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">{group.name}</div>
        <div className="text-xs text-muted-foreground">
          {group.count} avaliação{group.count === 1 ? "" : "es"}
        </div>
      </div>
      <span className={cn("shrink-0 tabular-nums font-semibold", npsTone(group.nps))}>
        {group.nps}
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// Corte 3 — Detratores com comentário (lista de follow-up).
// ------------------------------------------------------------

function DetractorsTab({ rated }: { rated: Gig[] }) {
  const detractors = useMemo(
    () =>
      rated
        .filter((g) => (g.rating_contractor ?? 0) <= 2.5)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [rated]
  );

  if (detractors.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Nenhum detrator por enquanto — todas as avaliações estão acima de 2,5.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {detractors.length} GIG{detractors.length === 1 ? "" : "s"} com nota ≤ 2,5. Lista para
        follow-up — clique para abrir o debrief.
      </p>
      <div className="space-y-1.5">
        {detractors.map((g) => (
          <Link
            key={g.id}
            to={`/gigs?debrief=${g.id}`}
            className="block rounded-md border border-destructive/40 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate font-medium">{gigDisplayName(g)}</div>
              <span className="shrink-0 tabular-nums font-semibold text-destructive">
                {g.rating_contractor?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / 5
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(g.date)}
              {g.venue_city ? ` · ${g.venue_city}` : ""}
            </div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
              {npsComment(g)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Corte 4 — Pesquisa NPS própria (respostas manuais, escala 0-10).
//
// NPS "clássico" de mercado, SEPARADO do derivado das GIGs (0-5): aqui o usuário
// registra à mão notas 0-10 de fãs/contratantes. Promotores = 9-10, neutros =
// 7-8, detratores = 0-6; NPS = %promotores − %detratores (-100..100).
// ------------------------------------------------------------

type SurveyCategory = "promoters" | "neutrals" | "detractors";

/** Categoria NPS de um score 0-10 (faixas padrão de mercado). */
function surveyCategoryOf(score: number): SurveyCategory {
  if (score >= 9) return "promoters";
  if (score >= 7) return "neutrals";
  return "detractors";
}

/** Cor da badge do score por faixa (verde/âmbar/vermelho). */
function surveyScoreBadge(score: number): string {
  const cat = surveyCategoryOf(score);
  return cat === "promoters"
    ? "bg-emerald-500 text-white"
    : cat === "neutrals"
    ? "bg-amber-400 text-black"
    : "bg-destructive text-destructive-foreground";
}

/**
 * NPS 0-10 das respostas da pesquisa própria. Mesma fórmula do derivado
 * (promotores% − detratores%), mas nas faixas 0-10. `nps` é null sem respostas.
 */
function surveyNps(responses: NpsResponse[]): {
  nps: number | null;
  promoters: number;
  neutrals: number;
  detractors: number;
  count: number;
} {
  const promoters = responses.filter((r) => r.score >= 9).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  const neutrals = responses.length - promoters - detractors;
  const nps = responses.length > 0
    ? Math.round((promoters / responses.length) * 100 - (detractors / responses.length) * 100)
    : null;
  return { nps, promoters, neutrals, detractors, count: responses.length };
}

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function SurveyTab() {
  const [responses, setResponses] = useState<NpsResponse[] | null>(null);

  // Campos do formulário de registro.
  const [score, setScore] = useState<number | null>(null);
  const [respondent, setRespondent] = useState("");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(() => toLocalISODate());
  const [saving, setSaving] = useState(false);

  // Carrega as respostas e recarrega quando algo muda (mesmo padrão do NpsSection
  // com as GIGs) — assim um add/delete daqui ou de outra superfície reflete aqui.
  useEffect(() => {
    const reload = () => {
      void listNpsResponses()
        .then(setResponses)
        .catch((e) => console.error("Falha ao carregar respostas de NPS", e));
    };
    reload();
    window.addEventListener(DATA_CHANGED, reload);
    return () => window.removeEventListener(DATA_CHANGED, reload);
  }, []);

  const { nps, promoters, neutrals, detractors, count } = useMemo(
    () => surveyNps(responses ?? []),
    [responses]
  );

  async function handleRegister() {
    if (score == null) {
      toast.error("Escolha uma nota de 0 a 10.");
      return;
    }
    setSaving(true);
    try {
      await addNpsResponse({
        score,
        respondent: respondent.trim() || null,
        comment: comment.trim() || null,
        response_date: date,
        source: "manual",
      });
      // emitDataChanged (dentro do add) dispara o reload via listener.
      setScore(null);
      setRespondent("");
      setComment("");
      setDate(toLocalISODate());
      toast.success("Resposta de NPS registrada.");
    } catch (e) {
      toast.error((e as Error).message ?? "Não foi possível registrar a resposta.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: NpsResponse) {
    const ok = await confirmDialog({
      title: "Excluir resposta",
      description: `Excluir a resposta de NPS (nota ${r.score})? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteNpsResponse(r.id);
      toast.success("Resposta excluída.");
    } catch (e) {
      toast.error((e as Error).message ?? "Não foi possível excluir a resposta.");
    }
  }

  if (!responses) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const tone = npsTone(nps);
  const verdict = npsVerdict(nps);

  return (
    <div className="space-y-5">
      {/* ── Registrar resposta ──────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 text-primary" />
          Registrar resposta
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Nota (0 = nada provável · 10 = extremamente provável)
          </Label>
          <div className="flex flex-wrap gap-1">
            {SCORE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                className={cn(
                  "h-9 w-9 rounded-md border text-sm font-semibold tabular-nums transition-colors",
                  score === n
                    ? surveyScoreBadge(n)
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
                aria-pressed={score === n}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nps-respondent" className="text-xs text-muted-foreground">
              Respondente (opcional)
            </Label>
            <Input
              id="nps-respondent"
              value={respondent}
              onChange={(e) => setRespondent(e.target.value)}
              placeholder="Nome de quem respondeu"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nps-date" className="text-xs text-muted-foreground">
              Data
            </Label>
            <Input
              id="nps-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nps-comment" className="text-xs text-muted-foreground">
            Comentário (opcional)
          </Label>
          <Textarea
            id="nps-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="O que motivou a nota?"
            className="min-h-[60px]"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleRegister} disabled={saving || score == null}>
            Registrar
          </Button>
        </div>
      </div>

      {/* ── NPS próprio (headline + contagem) ───────────────────────────────── */}
      {count > 0 ? (
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className={cn("text-4xl font-bold tabular-nums", tone)}>{nps}</div>
            <div className="text-xs text-muted-foreground">
              {verdict} · {count} resposta{count === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex-1 space-y-1.5 min-w-48">
            <NpsBar label="Promotores (9-10)" count={promoters} total={count} tone="bg-emerald-500" />
            <NpsBar label="Neutros (7-8)" count={neutrals} total={count} tone="bg-amber-400" />
            <NpsBar label="Detratores (0-6)" count={detractors} total={count} tone="bg-destructive" />
          </div>
        </div>
      ) : null}

      {/* ── Lista de respostas ──────────────────────────────────────────────── */}
      {responses.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Registre respostas de NPS de fãs/contratantes (nota 0-10) para acompanhar a
          satisfação ao longo do tempo, separada da avaliação das GIGs.
        </p>
      ) : (
        <div className="space-y-1.5">
          {responses.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                  surveyScoreBadge(r.score)
                )}
              >
                {r.score}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {r.respondent?.trim() || "Anônimo"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(r.response_date)}
                  </span>
                </div>
                {r.comment?.trim() ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {r.comment}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r)}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                title="Excluir resposta"
                aria-label="Excluir resposta"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
